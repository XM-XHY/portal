import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// 隔离共享存储：getContent / saveContents 用桩替换，验证固定窗口计数与降级语义。
vi.mock("@/lib/store", () => ({
  getContent: vi.fn(),
  saveContents: vi.fn(),
}));

import { rateLimit, noteFailure, lockedFor, clearFailures } from "@/lib/rate-limit";
import { getContent, saveContents } from "@/lib/store";

const KEY = "unit-rl";

beforeEach(async () => {
  (getContent as Mock).mockReset();
  (saveContents as Mock).mockReset();
  // 默认：无共享桶（共享存储读不到），仅依赖进程内计数
  (getContent as Mock).mockResolvedValue(null);
  (saveContents as Mock).mockResolvedValue(undefined);
  // 清空本 key 的本地计数桶，保证用例间隔离
  await clearFailures(KEY);
});

describe("rate-limit: 固定窗口计数", () => {
  it("未达上限 ok:true，retryAfter 0", async () => {
    expect(await rateLimit(KEY, 2, 10000)).toEqual({ ok: true, retryAfter: 0 });
    expect(await rateLimit(KEY, 2, 10000)).toEqual({ ok: true, retryAfter: 0 });
  });

  it("达到上限后 ok:false 且 retryAfter 为正整数", async () => {
    await rateLimit(KEY, 2, 10000);
    await rateLimit(KEY, 2, 10000);
    const r = await rateLimit(KEY, 2, 10000);
    expect(r.ok).toBe(false);
    expect(r.retryAfter).toBeGreaterThanOrEqual(1);
  });
});

describe("rate-limit: 登录锁定", () => {
  it("noteFailure 达阈值后 lockedFor>0，clearFailures 后归零", async () => {
    await noteFailure(KEY, 2, 60000);
    expect(await lockedFor(KEY)).toBe(0);
    await noteFailure(KEY, 2, 60000);
    const left = await lockedFor(KEY);
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThanOrEqual(60);
    await clearFailures(KEY);
    expect(await lockedFor(KEY)).toBe(0);
  });
});

describe("rate-limit: 共享存储降级", () => {
  it("getContent 抛错时仍可本地计数放行（不抛错）", async () => {
    (getContent as Mock).mockRejectedValue(new Error("db down"));
    const r = await rateLimit(KEY, 5, 10000);
    expect(r.ok).toBe(true);
    expect(r.retryAfter).toBe(0);
  });

  it("saveContents 抛错时静默降级，不抛错且仍按本地计数限流", async () => {
    (saveContents as Mock).mockRejectedValue(new Error("db down"));
    for (let i = 0; i < 5; i++) await rateLimit(KEY, 5, 10000);
    const blocked = await rateLimit(KEY, 5, 10000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThanOrEqual(1);
  });
});
