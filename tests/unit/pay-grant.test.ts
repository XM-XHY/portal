import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  signGrant,
  verifyGrant,
  GRANT_TTL_MS,
  type GrantMode,
  type GrantPayload,
} from "@/lib/pay-grant";

const PID = "prod-abc";

describe("pay-grant: sign/verify 往返", () => {
  it("signGrant → verifyGrant 往返成功且字段一致", () => {
    const token = signGrant({ pid: PID, oid: "order-1", mode: "paid" });
    const p = verifyGrant(token, PID);
    expect(p).not.toBeNull();
    expect((p as GrantPayload).pid).toBe(PID);
    expect((p as GrantPayload).oid).toBe("order-1");
    expect((p as GrantPayload).mode).toBe("paid");
    expect(typeof (p as GrantPayload).exp).toBe("number");
  });

  it("mode=free / self 也能正常签发与校验", () => {
    for (const mode of ["free", "self"] as GrantMode[]) {
      const t = signGrant({ pid: PID, oid: "o", mode });
      const p = verifyGrant(t, PID);
      expect(p).not.toBeNull();
      expect((p as GrantPayload).mode).toBe(mode);
    }
  });

  it("GRANT_TTL_MS 为 2 小时", () => {
    expect(GRANT_TTL_MS).toBe(2 * 60 * 60 * 1000);
  });
});

describe("pay-grant: 篡改与异常", () => {
  it("篡改 body（pid 不一致）后 verifyGrant 返回 null（timingSafeEqual 路径）", () => {
    const token = signGrant({ pid: PID, oid: "o", mode: "paid" });
    const sig = token.split(".")[1];
    // 用别的 pid 重造 body，但保留原 sig
    const tamperedBody = Buffer.from(
      JSON.stringify({ pid: "other", oid: "o", exp: Date.now() + 10000, mode: "paid" }),
      "utf8"
    ).toString("base64url");
    expect(verifyGrant(`${tamperedBody}.${sig}`, PID)).toBeNull();
  });

  it("篡改 sig（等长翻转）后 verifyGrant 返回 null（timingSafeEqual 路径）", () => {
    const token = signGrant({ pid: PID, oid: "o", mode: "paid" });
    const [body, sig] = token.split(".");
    const flipped = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
    expect(verifyGrant(`${body}.${flipped}`, PID)).toBeNull();
  });

  it("篡改 sig（长度不符）后 verifyGrant 返回 null", () => {
    const token = signGrant({ pid: PID, oid: "o", mode: "paid" });
    const [body] = token.split(".");
    const fakeSig = Buffer.from("x").toString("base64url").repeat(8);
    expect(verifyGrant(`${body}.${fakeSig}`, PID)).toBeNull();
  });

  it("过期（exp 已过）的票据 verifyGrant 返回 null", () => {
    const token = signGrant({ pid: PID, oid: "o", mode: "paid", ttlMs: -1000 });
    expect(verifyGrant(token, PID)).toBeNull();
  });

  it("mode 非法（非 paid/free/self）verifyGrant 返回 null", () => {
    const token = signGrant({ pid: PID, oid: "o", mode: "hack" as GrantMode });
    expect(verifyGrant(token, PID)).toBeNull();
  });

  it("token 为 null / 空 / pid 为空 时 verifyGrant 返回 null", () => {
    expect(verifyGrant(null, PID)).toBeNull();
    expect(verifyGrant("", PID)).toBeNull();
    expect(verifyGrant("a.b", "")).toBeNull();
  });

  it("缺少分隔符（无签名段）返回 null", () => {
    expect(verifyGrant("onlybody", PID)).toBeNull();
  });
});

describe("pay-grant: secret 回落（test 环境）", () => {
  const saved = {
    pay: process.env.PAY_GRANT_SECRET,
    adm: process.env.ADMIN_SESSION_SECRET,
  };
  beforeEach(() => {
    // secret() 在调用时（非模块加载时）读取 env，故可临时清除以验证 test 回落 dev 默认值
    delete process.env.PAY_GRANT_SECRET;
    delete process.env.ADMIN_SESSION_SECRET;
  });
  afterAll(() => {
    process.env.PAY_GRANT_SECRET = saved.pay;
    process.env.ADMIN_SESSION_SECRET = saved.adm;
  });

  it("缺密钥时 test 环境回落 dev 默认值，不抛错且可往返", () => {
    const t = signGrant({ pid: PID, oid: "o", mode: "free" });
    expect(verifyGrant(t, PID)).not.toBeNull();
  });
});
