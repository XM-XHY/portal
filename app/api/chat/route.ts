import { NextRequest, NextResponse } from "next/server";
import { getSite, getContents } from "@/lib/store";
import {
  type ChatMessage,
  type Knowledge,
  buildSystemPrompt,
  ruleReply,
  kbDirectReply,
  FALLBACK_REPLY,
} from "@/lib/chat";
import { searchKnowledge, formatHits } from "@/lib/kb";

export const dynamic = "force-dynamic";

/** 简单限流：同一 IP 5 秒至多 1 次 */
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const last = (globalThis as any).__lastChat?.[ip] || 0;
  if (now - last < 5000) return true;
  (globalThis as any).__lastChat = { ...((globalThis as any).__lastChat || {}), [ip]: now };
  return false;
}

/** 可选：调用 OpenAI 兼容大模型生成回复。未配置密钥或失败返回 null。 */
async function llmReply(
  system: string,
  history: ChatMessage[]
): Promise<string | null> {
  const key = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) return null;
  const base = process.env.LLM_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.LLM_MODEL || "gpt-4o-mini";

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, ...history],
        temperature: 0.5,
        max_tokens: 500,
      }),
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    return typeof text === "string" && text.trim() ? text.trim() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local";

  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "发送太频繁，请稍等几秒再试" },
      { status: 429 }
    );
  }

  let body: { messages?: { role?: string; content?: string }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const raw = (body.messages || []).filter(
    (m) =>
      (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string"
  );
  // 只保留最近 12 条，防止请求体过大
  const history = raw.slice(-12).map((m) => ({
    role: m.role as "user" | "assistant",
    content: (m.content || "").slice(0, 1000),
  }));
  const lastUser = [...history].reverse().find((m) => m.role === "user");
  if (!lastUser || !lastUser.content.trim()) {
    return NextResponse.json({ error: "缺少用户消息" }, { status: 400 });
  }

  // 企业知识库（实时读库，后台改完即生效）+ 管理员上传的 KB 文档
  const [site, products, cases, news, kbDocs] = await Promise.all([
    getSite(),
    getContents("product"),
    getContents("case"),
    getContents("news"),
    getContents("kb" as any),
  ]);
  const knowledge: Knowledge = { site, products, cases, news };

  // 知识库文档检索：从上传的 Word/Excel/PDF 中找与问题最相关的片段
  const kbHits = kbDocs.length ? searchKnowledge(kbDocs, lastUser.content) : [];
  const kbText = kbHits.length ? formatHits(kbHits) : undefined;

  // 1) 优先真实 LLM（命中知识库时把文档片段一并注入）
  const llm = await llmReply(buildSystemPrompt(knowledge, kbText), history);
  if (llm) {
    return NextResponse.json(
      {
        reply: llm,
        engine: "llm",
        kbSources: kbHits.length ? kbHits.map((h) => h.doc.title) : undefined,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  // 2) 知识库文档直接应答（未配 LLM 时的精准兜底）
  if (kbHits.length) {
    return NextResponse.json(
      { reply: kbDirectReply(lastUser.content, kbHits) ?? "", engine: "kb", kbSources: kbHits.map((h) => h.doc.title) },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  // 3) 规则引擎兜底
  const rule = ruleReply(lastUser.content, knowledge);
  return NextResponse.json(
    { reply: rule ?? FALLBACK_REPLY(knowledge), engine: "rules" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
