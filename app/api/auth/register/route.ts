import { NextRequest, NextResponse } from "next/server";
import { addAdmin, appendAudit } from "@/lib/store";
import { clientIp } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { initialAdminPassword } from "@/lib/data/defaults";

export const dynamic = "force-dynamic";

// 教师自助注册：完全开放公网，但做严格校验 + 限流防刷。
// 注册成功即创建一个 teacher 角色账号，默认仅持有 balance.manage
// （仅用于「老师端分班查询码管理」，不进入后台 CMS）。

/** 教师账号默认权限：仅分班查询码管理 */
const TEACHER_PERMS = ["balance.manage"];

const MAX_PER_WINDOW = 5;
const WINDOW_MS = 10 * 60 * 1000; // 10 分钟

function validUsername(v: unknown): string {
  const s = String(v || "").trim();
  return /^[a-zA-Z0-9_\-]{2,40}$/.test(s) ? s : "";
}

function validPassword(v: unknown): string | null {
  const s = String(v || "");
  if (s.length < 8 || s.length > 128) return null;
  if (!/[A-Za-z]/.test(s) || !/[0-9]/.test(s)) return null;
  if (s === initialAdminPassword()) return null;
  return s;
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);

  // 限流：同一 IP 10 分钟内最多注册 5 次，防批量刷号
  const rl = await rateLimit(`register:${ip}`, MAX_PER_WINDOW, WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `注册过于频繁，请 ${rl.retryAfter} 秒后再试` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const b = await req.json().catch(() => ({}));
  const username = validUsername(b?.username);
  const password = validPassword(b?.password);
  if (!username) {
    return NextResponse.json(
      { error: "账号需为 2-40 位字母/数字/下划线/中划线" },
      { status: 400 }
    );
  }
  if (!password) {
    return NextResponse.json(
      { error: "密码需 8-128 位、含字母与数字，且不能是初始口令" },
      { status: 400 }
    );
  }

  try {
    const created = await addAdmin({
      username,
      password,
      role: "teacher",
      perms: TEACHER_PERMS,
    });
    await appendAudit({
      actor: username,
      action: "teacher.register",
      target: `admin:${created.id}`,
      ip,
      detail: "教师自助注册",
    });
    return NextResponse.json({ ok: true, username });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "注册失败" },
      { status: 400 }
    );
  }
}
