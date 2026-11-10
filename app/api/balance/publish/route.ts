import { NextRequest, NextResponse } from "next/server";
import { saveContents, getContent, appendAudit } from "@/lib/store";
import { getAdminFromCookie } from "@/lib/session";
import { can } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import type { ContentItem } from "@/lib/data/types";

export const dynamic = "force-dynamic";

/** 查询码：6 位大写字母数字，去掉易混淆字符 */
function genCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

/** 管理密钥：兼容旧版「凭密钥管理」的记录（新记录以登录账号为准） */
function genManageKey(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/** 对外访问地址：优先取配置的正式域名（容器内 req.url 是内网地址） */
function originOf(req: NextRequest): string {
  const envBase = process.env.PAY_NOTIFY_BASE || process.env.NEXT_PUBLIC_SITE_URL;
  if (envBase) return envBase.replace(/\/+$/, "");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (host) return `${proto}://${host}`;
  return new URL(req.url).origin;
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * 发布分班查询：接收「班级 + 姓名」对照（不含成绩等敏感信息），
 * 存为 balance_pub 快照，返回查询码与查询链接。
 *
 * 安全：发布属于老师端操作，必须登录且具备 balance.manage 权限；
 * 记录 owner（账号名），此后在任何设备登录同一账号都能管理，
 * 不再依赖只存在本机浏览器的 manageKey。
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);

  // ① 登录与权限（放在限流之前，避免未登录请求也消耗配额）
  const admin = await getAdminFromCookie();
  if (!admin) {
    return NextResponse.json({ error: "请先在「我的发布记录」处登录老师账号，再发布查询码" }, { status: 401 });
  }
  if (!can(admin, "balance.manage")) {
    return NextResponse.json({ error: "当前账号没有分班查询码管理权限，请联系管理员" }, { status: 403 });
  }

  const rl = await rateLimit(`balp:${ip}`, 20, 3600_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `发布过于频繁，请 ${Math.ceil(rl.retryAfter / 60)} 分钟后再试` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    entries?: { className: string; names: string[] }[];
  };
  const title = String(body.title || "").slice(0, 60) || "新生分班查询";
  const entries = Array.isArray(body.entries) ? body.entries : [];
  if (!entries.length) return NextResponse.json({ error: "缺少分班结果" }, { status: 400 });

  let total = 0;
  const clean: { className: string; names: string[] }[] = [];
  for (const e of entries) {
    const className = String(e.className || "").slice(0, 30);
    const names = (Array.isArray(e.names) ? e.names : [])
      .map((n) => String(n || "").trim())
      .filter(Boolean)
      .slice(0, 40)
      .map((n) => n.slice(0, 40));
    if (!className || !names.length) continue;
    total += names.length;
    clean.push({ className, names });
  }
  if (!clean.length || total === 0) {
    return NextResponse.json({ error: "分班结果中没有学生数据" }, { status: 400 });
  }
  if (total > 3000) {
    return NextResponse.json({ error: "学生数超出上限（3000）" }, { status: 400 });
  }

  // ② 撞码检测：id 由查询码确定性推导，重复会静默覆盖他人发布，必须避开
  let code = genCode();
  for (let i = 0; i < 10; i++) {
    if (!(await getContent(`bal_${code}`))) break;
    code = genCode();
  }
  if (await getContent(`bal_${code}`)) {
    return NextResponse.json({ error: "查询码生成失败，请重试" }, { status: 500 });
  }

  const manageKey = genManageKey();
  const at = new Date().toISOString();
  const item: ContentItem = {
    // 确定性 id：查询码即 id 的一部分，保证 GET /api/balance/query?code=xxx 能直接定位
    id: `bal_${code}`,
    type: "balance_pub",
    title,
    tag: "balance_pub",
    summary: `${total} 人`,
    body: JSON.stringify({ title, entries: clean, at, manageKey, disabled: false, owner: admin.username }),
    icon: "⚖️",
    tags: [],
    client: admin.username, // 账号归属，便于服务端按 owner 列出
    industry: "",
    result: String(total),
    at,
    order: 0,
  };
  await saveContents([item]);

  await appendAudit({
    actor: admin.username,
    action: "balance.publish",
    target: `balance:${code}`,
    ip,
    detail: `${title} / ${total} 人 / ${clean.length} 个班`,
  });

  const url = `${originOf(req)}/balance/query?code=${code}`;
  return NextResponse.json({ ok: true, code, url, total, manageKey, at, owner: admin.username });
}
