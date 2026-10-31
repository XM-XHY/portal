import crypto from "crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { getAdmins, type Admin } from "./store";

const SECRET = process.env.ADMIN_SESSION_SECRET || "xx-tech-session-secret-change-me";
export const SESSION_COOKIE = "admin_session";

if (process.env.NODE_ENV === "production" && !process.env.ADMIN_SESSION_SECRET) {
  console.warn(
    "[session] 安全警告：生产环境未设置 ADMIN_SESSION_SECRET，正在使用默认密钥，" +
      "后台会话可被伪造！请在部署平台配置该环境变量为随机强值。"
  );
}

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
