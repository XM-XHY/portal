import crypto from "crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { getAdmins, type Admin } from "./store";
import { isBuildPhase, BUILD_PHASE_PLACEHOLDER } from "@/lib/runtime-phase";

const DEV_FALLBACK = "xx-tech-session-secret-change-me";

let cachedSecret: string | null = null;

/**
 * 解析后台会话签名密钥（惰性 + 记忆化）。
 *
 * ⚠️ 必须惰性求值：模块加载时就解析密钥，会让 next build 的静态生成阶段
 * 因缺少运行时环境变量而崩溃（见 lib/runtime-phase.ts 注释）。
 * 运行期缺密钥仍然 fail-fast，避免后台会话被伪造（SEC-03）。
 */
function getSecret(): string {
  if (cachedSecret !== null) return cachedSecret;

  const s = process.env.ADMIN_SESSION_SECRET?.trim();
  if (s) {
    cachedSecret = s;
    return cachedSecret;
  }

  if (isBuildPhase()) {
    // 构建期占位：构建阶段不会签发真实会话
    cachedSecret = BUILD_PHASE_PLACEHOLDER;
    return cachedSecret;
  }

  if (process.env.NODE_ENV === "production") {
    // SEC-03：生产环境缺失会话密钥时拒绝签发，避免后台会话被伪造（fail-fast）
    throw new Error(
      "[session] FATAL: 生产环境未配置 ADMIN_SESSION_SECRET，拒绝以默认密钥启动（后台会话可被伪造）。请在部署平台配置随机强值。"
    );
  }

  cachedSecret = DEV_FALLBACK;
  return cachedSecret;
}

/** 仅供测试重置记忆化缓存（不改变生产行为） */
export function __resetSecretCache(): void {
  cachedSecret = null;
}

export const SESSION_COOKIE = "admin_session";

export function signSession(adminId: string): string {
  const idB64 = Buffer.from(adminId).toString("base64url");
  const sig = crypto.createHmac("sha256", getSecret()).update(adminId).digest("base64url");
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
  const expected = crypto.createHmac("sha256", getSecret()).update(adminId).digest("base64url");
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
