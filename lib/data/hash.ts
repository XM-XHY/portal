import crypto from "crypto";

// 盐值：密码哈希与 JSON 存储、Supabase 存储共用同一套，保证两套存储切换时账号一致。
// SEC-03：生产环境缺失盐时必须 fail-fast，禁止使用写死的静态盐（等同无盐，可被预计算/彩虹表破解）。
function resolveSalt(): string {
  const s = process.env.ADMIN_PASSWORD_SALT?.trim();
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[hash] FATAL: 生产环境未配置 ADMIN_PASSWORD_SALT，拒绝使用静态盐哈希口令。请配置随机强值。"
    );
  }
  return "xx-tech-static-salt-v1";
}

export const SALT = resolveSalt();

export function hash(pw: string): string {
  return crypto.createHash("sha256").update(SALT + pw).digest("hex");
}

export function verifyPassword(input: string, hashStr: string): boolean {
  return hash(input) === hashStr;
}
