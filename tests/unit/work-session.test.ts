import { describe, it, expect, vi } from "vitest";

// 隔离 next/headers，避免加载 Next 内部。
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

import { signWorkSession, verifyWorkSession } from "@/lib/work-session";

describe("work-session: sign/verify", () => {
  it("signWorkSession → verifyWorkSession 往返", () => {
    const uid = "user-42";
    const token = signWorkSession(uid);
    expect(token).toContain(".");
    expect(verifyWorkSession(token)).toBe(uid);
  });

  it("篡改签名（等长翻转）返回 null（timingSafeEqual 路径）", () => {
    const token = signWorkSession("u1");
    const [body, sig] = token.split(".");
    const flipped = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
    expect(verifyWorkSession(`${body}.${flipped}`)).toBeNull();
  });

  it("token 为空 / undefined 返回 null", () => {
    expect(verifyWorkSession("")).toBeNull();
    expect(verifyWorkSession(undefined)).toBeNull();
  });

  it("缺少分隔符返回 null", () => {
    expect(verifyWorkSession("garbage")).toBeNull();
  });
});

describe("work-session: 过期", () => {
  it("过期票据 verifyWorkSession 返回 null", () => {
    try {
      vi.useFakeTimers();
      // 签发时刻
      vi.setSystemTime(new Date(1_000_000_000_000));
      const token = signWorkSession("u9");
      // 校验时刻推到 31 天后（TTL = 30 天）
      vi.setSystemTime(new Date(1_000_000_000_000 + 31 * 24 * 60 * 60 * 1000));
      expect(verifyWorkSession(token)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
