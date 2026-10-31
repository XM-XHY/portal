import crypto from "crypto";

// 静态盐值：密码哈希与 JSON 存储、Supabase 存储共用同一套，保证两套存储切换时账号一致。
// ⚠️ 生产环境建议改为随机强值并通过环境变量注入（见 .env.example 的 ADMIN_PASSWORD_SALT）。
export const SALT = process.env.ADMIN_PASSWORD_SALT || "xx-tech-static-salt-v1";

export function hash(pw: string): string {
  return crypto.createHash("sha256").update(SALT + pw).digest("hex");
}

export function verifyPassword(input: string, hashStr: string): boolean {
  return hash(input) === hashStr;
}
