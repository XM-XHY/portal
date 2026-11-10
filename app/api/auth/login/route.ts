import { NextRequest, NextResponse } from "next/server";
import { getAdmins, verifyPassword, appendAudit } from "@/lib/store";
import { signSession, SESSION_COOKIE, clientIp } from "@/lib/session";
import { lockedFor, noteFailure, clearFailures } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// 防暴破：按 账号+IP 累计失败次数，超阈值锁定 15 分钟。
// 计数写入共享存储，云托管多实例下不会再出现「换个实例就能继续撞库」。
const MAX_FAIL = 5;
const LOCK_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  const { username, password } = await req.json().catch(() => ({}));
  const ip = clientIp(req);
  if (!username || !password) {
    return NextResponse.json({ error: "缺少账号或密码" }, { status: 400 });
  }

  const key = `login:${username}@${ip}`;
  const lockedSeconds = await lockedFor(key);
  if (lockedSeconds > 0) {
    const mins = Math.ceil(lockedSeconds / 60);
    return NextResponse.json(
      { error: `尝试次数过多，请 ${mins} 分钟后再试` },
      { status: 429, headers: { "Retry-After": String(lockedSeconds) } }
    );
  }

  const admins = await getAdmins();
  const admin = admins.find((a) => a.username === username);
  if (!admin || !verifyPassword(password, admin.pwHash)) {
    await noteFailure(key, MAX_FAIL, LOCK_MS);
    await appendAudit({
      actor: username,
      action: "login.fail",
      target: "auth",
      ip,
      detail: "账号或密码错误",
    });
    return NextResponse.json({ error: "账号或密码错误" }, { status: 401 });
  }

  await clearFailures(key);
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
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return res;
}
