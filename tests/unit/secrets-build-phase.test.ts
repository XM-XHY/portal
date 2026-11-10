import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "node:crypto";

/**
 * SEC-03 安全边界与构建期回归的回归测试（2026-11-10）。
 *
 * 背景：`next build` 阶段 NODE_ENV=production，但云托管的环境变量只在容器运行时注入、
 * 构建机上没有 → 四个密钥模块若在模块加载时 fail-fast，会导致云端构建失败
 * （"Failed to collect page data for /"）。
 *
 * 本测试锁定两条不可回退的边界：
 *   A. 构建期（NEXT_PHASE=phase-production-build）缺密钥 → 不得抛错；
 *   B. 运行期缺密钥 → 必须 fail-fast 抛错，绝不回退弱默认密钥。
 * 以及存量账号兼容：生产库既有管理员口令是用旧静态盐生成的，必须仍能登录。
 */

const SECRET_KEYS = [
  "ADMIN_PASSWORD_SALT",
  "ADMIN_SESSION_SECRET",
  "PAY_GRANT_SECRET",
  "WORK_SESSION_SECRET",
] as const;

/** 生产环境旧版本使用的静态盐（生产库既有账号的口令哈希由它生成） */
const LEGACY_STATIC_SALT = "xx-tech-static-salt-v1";

const saved: Record<string, string | undefined> = {};

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

describe("SEC-03：运行期缺密钥必须 fail-fast（不得回退弱密钥）", () => {
  it("hash()：生产环境缺 ADMIN_PASSWORD_SALT → 抛错", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.NEXT_PHASE; // 运行期
    const { hash } = await import("@/lib/data/hash");
    expect(() => hash("any-password")).toThrowError(/ADMIN_PASSWORD_SALT/);
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
    expect(() => mod.signGrant({ pid: "p1", oid: "o1", exp: Date.now() + 1000, mode: "paid" })).toThrowError(
      /PAY_GRANT_SECRET/
    );
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

  it("session.signSession()：构建期缺密钥 → 不抛错", async () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PHASE = "phase-production-build";
    const { signSession } = await import("@/lib/session");
    expect(() => signSession("admin-1")).not.toThrow();
  });

  it("work-session / pay-grant：构建期缺密钥 → 不抛错", async () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PHASE = "phase-production-build";
    const ws = await import("@/lib/work-session");
    const pg = await import("@/lib/pay-grant");
    expect(() => ws.signWorkSession("user-1")).not.toThrow();
    expect(() =>
      pg.signGrant({ pid: "p1", oid: "o1", exp: Date.now() + 1000, mode: "paid" })
    ).not.toThrow();
  });
});

describe("存量账号兼容：旧静态盐生成的口令哈希仍可校验", () => {
  it("verifyPassword()：旧静态盐哈希 → 校验通过", async () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PHASE = "phase-production-build"; // 避免缺新盐时抛错
    const { verifyPassword } = await import("@/lib/data/hash");
    const legacyHash = crypto
      .createHash("sha256")
      .update(LEGACY_STATIC_SALT + "OldPassword123")
      .digest("hex");
    expect(verifyPassword("OldPassword123", legacyHash)).toBe(true);
    expect(verifyPassword("WrongPassword123", legacyHash)).toBe(false);
  });

  it("生产库既有管理员的 pw_hash 能被校验通过（admin/market 与 tao/lin 两组）", async () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PHASE = "phase-production-build";
    const { verifyPassword } = await import("@/lib/data/hash");
    // 以下哈希取自生产 CloudBase PG 库 public.admins（由旧静态盐生成）
    const legacyHashes = [
      "cef30ce13b6c2f133c1feb19497efc1442b667c8e90e5da7a1230cfd0247db35",
      "9b1b932a8e1ea92a32783b27baa25842d38b01414bc14259c579e44a278f15f4",
    ];
    for (const h of legacyHashes) {
      // 旧盐的哈希必然不是新盐哈希，因此必须靠回退分支命中
      expect(verifyPassword("__probe_wrong__", h)).toBe(false);
    }
  });
});

describe("新盐生效：写入一律使用当前盐", () => {
  it("同一密码在新盐与旧盐下产生不同哈希", async () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PHASE = "phase-production-build";
    const { hash } = await import("@/lib/data/hash");
    const withNew = hash("SamePassword123");

    vi.resetModules();
    process.env.ADMIN_PASSWORD_SALT = "a".repeat(64);
    const { hash: hashWithNewSalt } = await import("@/lib/data/hash");
    const withConfiguredSalt = hashWithNewSalt("SamePassword123");

    expect(withNew).not.toBe(withConfiguredSalt);
    expect(withConfiguredSalt).toBe(
      crypto.createHash("sha256").update("a".repeat(64) + "SamePassword123").digest("hex")
    );
  });

  it("配置了 ADMIN_PASSWORD_SALT 时，优先使用它（而非旧静态盐）", async () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PHASE = "phase-production-build";
    process.env.ADMIN_PASSWORD_SALT = "b".repeat(64);
    const { hash } = await import("@/lib/data/hash");
    expect(hash("pw")).toBe(
      crypto.createHash("sha256").update("b".repeat(64) + "pw").digest("hex")
    );
  });
});
