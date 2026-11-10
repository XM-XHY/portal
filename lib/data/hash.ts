import crypto from "crypto";
import { isBuildPhase, buildPhaseSecret } from "@/lib/runtime-phase";

// 盐值：密码哈希与 JSON 存储、Supabase 存储共用同一套，保证两套存储切换时账号一致。
// SEC-03：生产环境缺失盐时必须 fail-fast，禁止使用写死的静态盐（等同无盐，可被预计算/彩虹表破解）。
//
// ⚠️ 关键约束（2026-11-10 修复构建期回归）：
//   1. 盐必须**惰性求值**（首次使用时才解析），不能在模块加载时求值 ——
//      否则 next build 的静态生成阶段就会因缺运行时环境变量而崩溃。
//   2. 构建期（NEXT_PHASE=phase-production-build）允许使用占位盐，保证构建可通过；
//      运行期缺盐仍然 fail-fast，绝不回退弱密钥（SEC-03 的原始意图）。
//   3. 存量账号兼容：生产库既有管理员口令是用旧静态盐生成的，
//      verifyPassword 需在主盐不匹配时用旧盐回退校验一次（仅校验，不用于新写入）。

/**
 * 旧版本使用的静态盐。生产库既有账号的口令哈希由它生成，需保留以兼容登录。
 *
 * ⚠️ 该盐值早已随源码公开，绝不可用于**写入**新哈希；仅供 verifyPassword 校验存量账号。
 */
export const LEGACY_STATIC_SALT = "xx-tech-static-salt-v1";

/**
 * 存量兼容校验开关的环境变量名。
 * 存量账号全部重算口令（scripts/rotate-admin-password.mjs）后，可置为 "off" 关闭回退校验，
 * 让旧静态盐彻底退出校验链路。
 */
const LEGACY_COMPAT_ENV = "ADMIN_PASSWORD_LEGACY_COMPAT";

let cachedSalt: string | null = null;

/**
 * 解析当前生效的盐（惰性 + 记忆化）。
 * - 已配置 ADMIN_PASSWORD_SALT → 用它；
 * - 构建期且未配置 → 用构建期占位盐（不落库）；
 * - 运行期且 NODE_ENV=production 且未配置 → 抛错（fail-fast）；
 * - 其余（开发/测试）→ 用旧静态盐兜底，保持本地开发体验不变。
 */
export function getSalt(): string {
  if (cachedSalt !== null) return cachedSalt;

  const s = process.env.ADMIN_PASSWORD_SALT?.trim();
  if (s) {
    cachedSalt = s;
    return cachedSalt;
  }

  if (isBuildPhase()) {
    // 构建期占位：仅用于让静态生成通过，绝不会写入生产数据库。
    // 随机值而非固定常量：即使构建产物里残留任何由它派生的签名，也无法被外部伪造。
    cachedSalt = buildPhaseSecret();
    return cachedSalt;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[hash] FATAL: 生产环境未配置 ADMIN_PASSWORD_SALT，拒绝使用静态盐哈希口令。请配置随机强值。"
    );
  }

  cachedSalt = LEGACY_STATIC_SALT;
  return cachedSalt;
}

/** 仅供测试重置记忆化缓存（不改变生产行为） */
export function __resetSaltCache(): void {
  cachedSalt = null;
}

/**
 * 当前生效的口令哈希盐（兼容旧导出名）。
 *
 * ⚠️ 这里**不能**再导出 `export const SALT = resolveSalt()` 那样的常量：
 * 常量会在模块加载时求值，正是 SEC-03 修复掉的构建期崩溃根因。
 * 改为惰性取值函数，既保留 `@/lib/store` 的既有导入路径，又不引入加载期求值。
 */
export function SALT(): string {
  return getSalt();
}

/**
 * 是否允许用旧静态盐回退校验存量账号的口令哈希。
 *
 * 默认开启：生产库 4 个存量管理员的口令哈希由旧静态盐生成，
 * 若直接换用新的随机盐而不开回退，他们将立即无法登录、且改密接口也会被锁死
 * （改密需先用旧口令通过校验）。
 * 存量账号全部重算后，把 ADMIN_PASSWORD_LEGACY_COMPAT 置为 off 即可关闭。
 */
function legacyCompatEnabled(): boolean {
  const v = process.env[LEGACY_COMPAT_ENV]?.trim().toLowerCase();
  return v !== "off" && v !== "0" && v !== "false" && v !== "no";
}

/** 常量时间比较，避免口令哈希校验的时序侧信道 */
function timingSafeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function hash(pw: string): string {
  return crypto.createHash("sha256").update(getSalt() + pw).digest("hex");
}

export function verifyPassword(input: string, hashStr: string): boolean {
  if (timingSafeEqual(hash(input), hashStr)) return true;
  // 存量账号兼容：旧静态盐时期生成的口令哈希。
  // 仅用于校验既有账号能否登录；任何新写入都用当前盐（hash() 从不使用旧盐）。
  if (!legacyCompatEnabled()) return false;
  const legacy = crypto
    .createHash("sha256")
    .update(LEGACY_STATIC_SALT + input)
    .digest("hex");
  return timingSafeEqual(legacy, hashStr);
}
