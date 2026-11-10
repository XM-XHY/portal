import crypto from "crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { getAdmins, type Admin } from "./store";

const DEV_FALLBACK = "xx-tech-session-secret-change-me";

function resolveSecret(): string {
  const s = process.env.ADMIN_SESSION_SECRET?.trim();
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    // SEC-03：生产环境缺失会话密钥时拒绝启动，避免后台会话被伪造（fail-fast）
    throw new Error(
      "[session] FATAL: 生产环境未配置 ADMIN_SESSION_SECRET，拒绝以默认密钥启动（后台会话可被伪造）。请在部署平台配置随机强值。"
    );
  }
  return DEV_FALLBACK;
}

const SECRET = resolveSecret();
export const SESSION_COOKIE = "admin_session";

export function signSession(adminId: string): string {
  const idB64 = Buffer.from(adminId).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(adminId).digest("base64url");
  return `${idB64}.${sig}`;
}

export function verifyToken(token: string | undefined): string | null {
  if (!token) return null;
  const [idB64, sig] = token.split(".");
  if (!idB64 || !sig) return null;
  let adminId: string;
  try {
    adminId = Buffer.from(idB64, "base64url").toString();
  } catch {
    return null;
  }
  const expected = crypto.createHmac("sha256", SECRET).update(adminId).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return adminId;
}

export async function getAdminFromCookie(): Promise<Admin | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const id = verifyToken(token);
  if (!id) return null;
  const admins = await getAdmins();
  return admins.find((a) => a.id === id) || null;
}

export function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}
