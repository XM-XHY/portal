/**
 * 作品中心 C 端会话（与后台 admin_session 完全隔离）。
 *
 * 主站原先只有后台管理员会话，作品是纯 localStorage 账号；并入统一数据库后
 * 必须有一个跨设备可识别的身份，才能把会员权益、错题库绑定到人而不是浏览器。
 * 这里用无状态的 HMAC 票据（stateless），不额外建会话表。
 *
 * 密钥优先 WORK_SESSION_SECRET，未配置时回落 ADMIN_SESSION_SECRET。
 */
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { isBuildPhase, buildPhaseSecret } from "@/lib/runtime-phase";

export const WORK_COOKIE = "work_session";
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

function secret(): string {
  const s = process.env.WORK_SESSION_SECRET?.trim() || process.env.ADMIN_SESSION_SECRET?.trim();
  if (s) return s;
  // 构建期占位：next build 阶段不会签发真实作品会话（见 lib/runtime-phase.ts）
  if (isBuildPhase()) return buildPhaseSecret();
  if (process.env.NODE_ENV === "production") {
    // SEC-03：生产环境缺失作品会话密钥时拒绝签发，避免会员会话被伪造（fail-fast）
    throw new Error(
      "[work-session] FATAL: 生产环境未配置 WORK_SESSION_SECRET/ADMIN_SESSION_SECRET，拒绝以默认密钥签发作品会话。请配置随机强值。"
    );
  }
  return "dev-work-session-secret-change-me";
}

function mac(body: string): string {
  return crypto.createHmac("sha256", secret()).update(body).digest("base64url");
}

export function signWorkSession(userId: string): string {
  const body = Buffer.from(
    JSON.stringify({ u: userId, exp: Date.now() + TTL_MS }),
    "utf8"
  ).toString("base64url");
  return `${body}.${mac(body)}`;
}

export function verifyWorkSession(token: string | undefined | null): string | null {
  if (!token) return null;
  const [body, sig] = String(token).split(".");
  if (!body || !sig) return null;
  const expected = mac(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!p || typeof p.u !== "string" || typeof p.exp !== "number") return null;
    if (p.exp < Date.now()) return null;
    return p.u;
  } catch {
    return null;
  }
}

/** 服务端读取当前作品用户 id；未登录返回 null */
export async function getWorkUserId(): Promise<string | null> {
  return verifyWorkSession(cookies().get(WORK_COOKIE)?.value);
}

export const WORK_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: Math.floor(TTL_MS / 1000),
};
