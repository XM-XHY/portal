import { NextRequest, NextResponse } from "next/server";
import { getContents, getSite, appendAudit } from "@/lib/store";
import { getAdminFromCookie, clientIp } from "@/lib/session";
import { searchKnowledge } from "@/lib/kb";
import { buildMaterialPrompt, fallbackMaterial } from "@/lib/hub";
import { llmChat } from "@/lib/llm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 简单限流：同一 IP 4 秒至多 1 次 */
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const last = (globalThis as any).__lastHubGen?.[ip] || 0;
  if (now - last < 4000) return true;
  (globalThis as any).__lastHubGen = { ...((globalThis as any).__lastHubGen || {}), [ip]: now };
  return false;
}

/** 从材料正文里取标题：优先第一个 # 标题，否则取需求前 40 字 */
function titleOf(content: string, question: string): string {
  const h1 = content.split("\n").find((l) => l.startsWith("#"));
  if (h1) return h1.replace(/^#+\s*/, "").trim().slice(0, 60) || "生成材料";
  return question.replace(/\s+/g, " ").slice(0, 40) || "生成材料";
}

/**
 * 对话式材料生成：员工提出需求 → 检索知识库 → 大模型起草（未配 LLM 时整理知识库原文）。
 * 仅登录用户可用（员工 / 后台账号）。
 */
export async function POST(req: NextRequest) {
  const user = await getAdminFromCookie();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const ip = clientIp(req);
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "操作太频繁，请稍等几秒再试" }, { status: 429 });
  }

  const b = await req.json().catch(() => ({}));
  const question = String(b?.question || "").trim().slice(0, 2000);
  if (!question) {
    return NextResponse.json({ error: "请描述你想生成的材料" }, { status: 400 });
  }

  const [site, kbDocs] = await Promise.all([getSite(), getContents("kb")]);
  const hits = kbDocs.length ? searchKnowledge(kbDocs, question, 5) : [];
  const sources = Array.from(new Set(hits.map((h) => h.doc.title)));

  // 国产大模型优先（见 lib/llm.ts）；未配置或失败时回落到知识库原文整理
  const llm = await llmChat({
    system: buildMaterialPrompt(site.companyName, question, hits),
    messages: [{ role: "user", content: question }],
    temperature: 0.4,
    maxTokens: 1600,
    timeoutMs: 50000,
  });

  const content =
    llm ?? fallbackMaterial(question, hits, site.companyName).content;

  await appendAudit({
    actor: user.username,
    action: "hub.generate",
    target: "hub",
    ip,
    detail: question.slice(0, 60),
  });

  return NextResponse.json(
    {
      title: titleOf(content, question),
      content,
      engine: llm ? "llm" : hits.length ? "kb" : "template",
      sources: sources.length ? sources : undefined,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
