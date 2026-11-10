/**
 * 付费下载授权票据（stateless，HMAC-SHA256 签名）。
 *
 * 背景：此前下载/导出接口只看前端是否点了「支付成功」，任何人直接请求接口就能拿到文件，
 * 付费墙形同虚设。现在由服务端在确认订单已支付后签发一枚短期票据，
 * 所有受保护的下载接口都必须校验票据的签名、商品 id 与有效期。
 *
 * 票据内容：{ pid, oid, exp, mode }
 *  - pid：付费商品 id（与后台「产品付费」配置的 key 一致），防止 A 商品票据拿去下 B 商品
 *  - oid：订单号；"free" 表示免费放行，"self" 表示自助扫码申报（已写审计日志）
 *  - exp：过期时间（毫秒时间戳）
 *  - mode：paid | free | self
 *
 * 密钥取 PAY_GRANT_SECRET，未配置时回落到 ADMIN_SESSION_SECRET；
 * 两者都没有时（仅本地开发）使用固定兜底值，部署时务必配置随机强值。
 */
import crypto from "node:crypto";
import { isBuildPhase, buildPhaseSecret } from "@/lib/runtime-phase";

export type GrantMode = "paid" | "free" | "self";

export type GrantPayload = {
  pid: string;
  oid: string;
  exp: number;
  mode: GrantMode;
};

function secret(): string {
  const s = process.env.PAY_GRANT_SECRET?.trim() || process.env.ADMIN_SESSION_SECRET?.trim();
  if (s) return s;
  // 构建期占位：next build 阶段不会签发真实付费票据（见 lib/runtime-phase.ts）
  if (isBuildPhase()) return buildPhaseSecret();
  if (process.env.NODE_ENV === "production") {
    // SEC-03：生产环境缺失票据密钥时拒绝签发，避免付费票据被伪造（fail-fast）
    throw new Error(
      "[pay-grant] FATAL: 生产环境未配置 PAY_GRANT_SECRET/ADMIN_SESSION_SECRET，拒绝以默认密钥签发付费票据。请配置随机强值。"
    );
  }
  return "dev-pay-grant-secret-change-me";
}

function b64url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}

function mac(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** 默认票据有效期 2 小时；自助申报票据 30 分钟 */
export const GRANT_TTL_MS = 2 * 60 * 60 * 1000;

export function signGrant(input: {
  pid: string;
  oid: string;
  mode: GrantMode;
  ttlMs?: number;
}): string {
  const payload: GrantPayload = {
    pid: String(input.pid).slice(0, 80),
    oid: String(input.oid).slice(0, 80),
    mode: input.mode,
    exp: Date.now() + (input.ttlMs ?? (input.mode === "self" ? 30 * 60 * 1000 : GRANT_TTL_MS)),
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${mac(body)}`;
}

/** 校验票据；失败返回 null（不抛错，便于接口统一返回 402/403） */
export function verifyGrant(token: string | null | undefined, pid: string): GrantPayload | null {
  if (!token || !pid) return null;
  const [body, sig] = String(token).split(".");
  if (!body || !sig) return null;
  const expected = mac(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as GrantPayload;
    if (!p || p.pid !== pid || typeof p.exp !== "number") return null;
    if (!["paid", "free", "self"].includes(p.mode)) return null;
    if (p.exp < Date.now()) return null;
    return p;
  } catch {
    return null;
  }
}

/** 从请求里取票据：优先 query 参数 grant，其次 X-Pay-Grant 头 */
export function grantFromRequest(req: { nextUrl?: URL; headers: Headers }): string | null {
  const q = req.nextUrl?.searchParams.get("grant");
  if (q) return q;
  return req.headers.get("x-pay-grant");
}
