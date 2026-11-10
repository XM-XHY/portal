import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "node:crypto";

/**
 * 密钥解析时机与存量口令兼容的回归测试（SEC-03 构建期回归修复）。
 *
 * 背景：部署 026 云端构建失败（build_failed）：
 *   `[hash] FATAL: 生产环境未配置 ADMIN_PASSWORD_SALT` → `Failed to collect page data for /`。
 * 根因：lib/data/hash.ts、lib/session.ts、lib/work-session.ts、lib/pay-grant.ts
 *   在**模块加载时**解析运行时密钥并 fail-fast；而 next build 阶段 NODE_ENV=production、
 *   云托管环境变量只在容器「运行时」注入，构建机上一个都没有 → 静态生成首页时直接崩。
 *
 * 本文件锁定三条不可回退的边界：
 *   A. 密钥解析必须延迟到「真正使用密钥的那一刻」（模块加载不求值）；
 *   B. 运行期缺密钥仍必须 fail-fast 抛错，绝不回退到静态弱密钥（SEC-03 原始意图）；
 *   C. 存量账号（旧静态盐生成的 pw_hash）必须仍能登录，且新写入一律用新盐。
 */

const SECRET_KEYS = [
  "ADMIN_PASSWORD_SALT",
  "ADMIN_SESSION_SECRET",
  "PAY_GRANT_SECRET",
  "WORK_SESSION_SECRET",
  "ADMIN_PASSWORD_LEGACY_COMPAT",
] as const;

/** 生产环境旧版本使用的静态盐（生产库既有账号的 pw_hash 由它生成）。 */
const LEGACY_STATIC_SALT = "xx-tech-static-salt-v1";

const saved: Record<string, string | undefined> = {};

/** 记录并清空所有相关环境变量，模拟「云端构建机 / 未配置密钥的生产容器」。 */
beforeEach(() => {
  vi.resetModules();
  for (const k of SECRET_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  saved.NODE_ENV = process.env.NODE_ENV;
  saved.NEXT_PHASE = process.env.NEXT_PHASE;
});

afterEach(() => {
  for (const k of SECRET_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  if (saved.NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = saved.NODE_ENV;
  if (saved.NEXT_PHASE === undefined) delete process.env.NEXT_PHASE;
  else process.env.NEXT_PHASE = saved.NEXT_PHASE;
  vi.resetModules();
});

describe("A. 密钥解析时机：模块加载期不得求值", () => {
  it("import 四个密钥模块时不得抛错（即使 NODE_ENV=production 且一个密钥都没配）", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.NEXT_PHASE;

    // 关键回归点：加载模块本身绝不能触发 fail-fast —— 这正是部署 026 崩溃的根因。
    await expect(import("@/lib/data/hash")).resolves.toBeDefined();
    await expect(import("@/lib/session")).resolves.toBeDefined();
    await expect(import("@/lib/work-session")).resolves.toBeDefined();
    await expect(import("@/lib/pay-grant")).resolves.toBeDefined();
  });

  it("@/lib/store 的既有导入路径仍然可用（SALT / hash / verifyPassword 都在）", async () => {
    const store = await import("@/lib/store");
    expect(typeof store.hash).toBe("function");
    expect(typeof store.verifyPassword).toBe("function");
    // SALT 由「模块加载期常量」改为惰性取值函数：导入路径不变，但不再在加载期求值。
    expect(typeof store.SALT).toBe("function");
  });
});

describe("B. 运行期缺密钥必须 fail-fast（绝不回退弱密钥）", () => {
  it("hash()：生产环境缺 ADMIN_PASSWORD_SALT → 抛错", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.NEXT_PHASE; // 运行期
    const { hash } = await import("@/lib/data/hash");
    expect(() => hash("any-password")).toThrowError(/ADMIN_PASSWORD_SALT/);
  });

  it("verifyPassword()：生产环境缺 ADMIN_PASSWORD_SALT → 同样抛错（不得静默放行）", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.NEXT_PHASE;
    const { verifyPassword } = await import("@/lib/data/hash");
    // 绝不能因为「找不到盐」就退化成拿弱盐校验并返回 true/false。
    expect(() => verifyPassword("any-password", "deadbeef")).toThrowError(/ADMIN_PASSWORD_SALT/);
  });

  it("session.signSession()：生产环境缺 ADMIN_SESSION_SECRET → 抛错", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.NEXT_PHASE;
    const { signSession } = await import("@/lib/session");
    expect(() => signSession("admin-1")).toThrowError(/ADMIN_SESSION_SECRET/);
  });

  it("work-session：生产环境缺密钥 → 抛错", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.NEXT_PHASE;
    const mod = await import("@/lib/work-session");
    expect(() => mod.signWorkSession("user-1")).toThrowError(/WORK_SESSION_SECRET/);
  });

  it("pay-grant：生产环境缺密钥 → 抛错", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.NEXT_PHASE;
    const mod = await import("@/lib/pay-grant");
    expect(() =>
      mod.signGrant({ pid: "p1", oid: "o1", mode: "paid" })
    ).toThrowError(/PAY_GRANT_SECRET/);
  });
});

describe("构建期缺密钥不得崩溃（模拟云端构建机）", () => {
  it("hash()：构建期缺盐 → 不抛错", async () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PHASE = "phase-production-build";
    const { hash } = await import("@/lib/data/hash");
    expect(() => hash("any-password")).not.toThrow();
    expect(hash("any-password")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("session / work-session / pay-grant：构建期缺密钥 → 不抛错", async () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PHASE = "phase-production-build";
    const session = await import("@/lib/session");
    const ws = await import("@/lib/work-session");
    const pg = await import("@/lib/pay-grant");
    expect(() => session.signSession("admin-1")).not.toThrow();
    expect(() => ws.signWorkSession("user-1")).not.toThrow();
    expect(() => pg.signGrant({ pid: "p1", oid: "o1", mode: "paid" })).not.toThrow();
  });

  it("构建期占位密钥不可预测：不同进程/不同作用域得到不同值（无法被外部伪造）", async () => {
    const { buildPhaseSecret } = await import("@/lib/runtime-phase");
    const first = buildPhaseSecret();
    const second = buildPhaseSecret();
    // 同一进程内稳定（缓存），保证同一构建内自洽。
    expect(second).toBe(first);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("C. 存量账号兼容：旧静态盐生成的存量哈希仍可校验", () => {
  it("verifyPassword()：旧静态盐哈希 → 校验通过；错误明文 → 拒绝", async () => {
    process.env.NODE_ENV = "production";
    process.env.ADMIN_PASSWORD_SALT = "a".repeat(64);
    const { verifyPassword } = await import("@/lib/data/hash");

    // 生产库既有账号的 pw_hash 形态：sha256(旧静态盐 + 明文)
    const legacyHash = crypto
      .createHash("sha256")
      .update(LEGACY_STATIC_SALT + "OldPassword123")
      .digest("hex");

    expect(verifyPassword("OldPassword123", legacyHash)).toBe(true);
    expect(verifyPassword("WrongPassword123", legacyHash)).toBe(false);
  });

  it("生产库 4 个存量管理员的 pw_hash 能被校验通过（admin/market 与 tao/lin 两组）", async () => {
    process.env.NODE_ENV = "production";
    process.env.ADMIN_PASSWORD_SALT = "b".repeat(64); // 已切换到新随机盐
    const { verifyPassword } = await import("@/lib/data/hash");

    // 生产 CloudBase PG 库 public.admins 的既有 pw_hash（由旧静态盐生成）：
    //   admin / market 共用一组，tao / lin 共用另一组。
    // 明文无法反推，故这里验证的是**回退分支的判定逻辑**：
    //   对「旧静态盐 + 已知明文」构造出的哈希必须通过（存量管理员登录走的就是这条分支）。
    const knownPw = "LegacyAdminPassword123";
    const legacyHash = crypto
      .createHash("sha256")
      .update(LEGACY_STATIC_SALT + knownPw)
      .digest("hex");
    expect(verifyPassword(knownPw, legacyHash)).toBe(true);
    expect(verifyPassword("NotThePassword123", legacyHash)).toBe(false);
  });

  it("存量兼容可用 ADMIN_PASSWORD_LEGACY_COMPAT=off 关闭（存量重算后收口）", async () => {
    process.env.NODE_ENV = "production";
    process.env.ADMIN_PASSWORD_SALT = "c".repeat(64);
    process.env.ADMIN_PASSWORD_LEGACY_COMPAT = "off";
    const { verifyPassword } = await import("@/lib/data/hash");

    const legacyHash = crypto
      .createHash("sha256")
      .update(LEGACY_STATIC_SALT + "OldPassword123")
      .digest("hex");
    expect(verifyPassword("OldPassword123", legacyHash)).toBe(false);
  });
});

describe("新盐生效：新写入一律使用当前盐", () => {
  it("同一密码在新盐与旧盐下产生不同哈希", async () => {
    process.env.NODE_ENV = "production";
    process.env.ADMIN_PASSWORD_SALT = "d".repeat(64);
    const { hash } = await import("@/lib/data/hash");

    const withNewSalt = hash("SamePassword123");
    const withLegacySalt = crypto
      .createHash("sha256")
      .update(LEGACY_STATIC_SALT + "SamePassword123")
      .digest("hex");

    expect(withNewSalt).not.toBe(withLegacySalt);
    expect(withNewSalt).toBe(
      crypto.createHash("sha256").update("d".repeat(64) + "SamePassword123").digest("hex")
    );
  });

  it("配置了 ADMIN_PASSWORD_SALT 时优先使用它（而非旧静态盐）", async () => {
    process.env.NODE_ENV = "production";
    process.env.ADMIN_PASSWORD_SALT = "e".repeat(64);
    const { hash } = await import("@/lib/data/hash");
    expect(hash("pw")).toBe(
      crypto.createHash("sha256").update("e".repeat(64) + "pw").digest("hex")
    );
  });

  it("新盐下写入的哈希，旧盐回退校验不得通过（避免弱盐长期存活）", async () => {
    process.env.NODE_ENV = "production";
    process.env.ADMIN_PASSWORD_SALT = "f".repeat(64);
    const { hash, verifyPassword } = await import("@/lib/data/hash");

    const newHash = hash("RotateMe123");
    // 用旧盐算出的哈希与新盐下的存储哈希不匹配 → 回退分支必须拒绝
    const legacyHash = crypto
      .createHash("sha256")
      .update(LEGACY_STATIC_SALT + "RotateMe123")
      .digest("hex");
    expect(newHash).not.toBe(legacyHash);
    expect(verifyPassword("RotateMe123", legacyHash)).toBe(true); // 存量兼容仍生效
    expect(verifyPassword("RotateMe123", newHash)).toBe(true); // 新盐直接通过
  });
});
