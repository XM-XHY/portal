import { NextRequest, NextResponse } from "next/server";
import { getAdmins, verifyPassword, appendAudit } from "@/lib/store";
import { signSession, SESSION_COOKIE, clientIp } from "@/lib/session";

export const dynamic = "force-dynamic";

// 简易防暴破：按 账号+IP 记录失败次数，超阈值锁定一段时间（演示用，生产应换 Redis/限流中间件）
const MAX_FAIL = 5;
const LOCK_MS = 15 * 60 * 1000;
const failMap = new Map<string, { count: number; until: number }>();

export async function POST(req: NextRequest) {
  const { username, password } = await req.json().catch(() => ({}));
  const ip = clientIp(req);
  if (!username || !password) {
    return NextResponse.json({ error: "缺少账号或密码" }, { status: 400 });
  }

  const key = `${username}@${ip}`;
  const fail = failMap.get(key);
  if (fail && fail.until > Date.now()) {
    const mins = Math.ceil((fail.until - Date.now()) / 60000);
    return NextResponse.json(
      { error: `尝试次数过多，请 ${mins} 分钟后再试` },
      { status: 429 }
    );
  }

  const admins = await getAdmins();
  const admin = admins.find((a) => a.username === username);
  if (!admin || !verifyPassword(password, admin.pwHash)) {
    const f = failMap.get(key) || { count: 0, until: 0 };
    f.count += 1;
    if (f.count >= MAX_FAIL) f.until = Date.now() + LOCK_MS;
    failMap.set(key, f);
    await appendAudit({
      actor: username,
      action: "login.fail",
      target: "auth",
      ip,
      detail: f.count >= MAX_FAIL ? "locked" : `fail#${f.count}`,
    });
    return NextResponse.json({ error: "账号或密码错误" }, { status: 401 });
  }

  failMap.delete(key);
  const token = signSession(admin.id);
  await appendAudit({
    actor: admin.username,
    action: "login.success",
    target: "auth",
    ip,
  });
  const res = NextResponse.json({ ok: true, role: admin.role, username: admin.username });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return res;
}
