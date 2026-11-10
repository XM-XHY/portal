import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// 隔离数据层与支付/订单依赖：
// - store.getContents 驱动真实的 getPayConfig（复用其解析逻辑）
// - orders.getOrder / payment.getPaymentProvider 用桩控制放行与否
vi.mock("@/lib/store", () => ({
  getContents: vi.fn(),
  getContent: vi.fn(),
  saveContents: vi.fn(),
}));
vi.mock("@/lib/orders", () => ({ getOrder: vi.fn() }));
vi.mock("@/lib/payment", () => ({ getPaymentProvider: vi.fn() }));

import { requirePaidAccess } from "@/lib/pay-access";
import { signGrant } from "@/lib/pay-grant";
import { getContents } from "@/lib/store";
import { getOrder } from "@/lib/orders";
import { getPaymentProvider } from "@/lib/payment";
import { PAYCFG_ID } from "@/lib/payconfig";
import type { Order } from "@/lib/orders";

const PID = "prod-access";

const mockGetContents = (items: Record<string, { paid: boolean; amount: number }>) => {
  (getContents as Mock).mockResolvedValue([
    {
      id: PAYCFG_ID,
      type: "paycfg" as const,
      title: "",
      tag: "",
      summary: "",
      body: JSON.stringify({ qrImageUrl: "", qrNote: "", items }),
      icon: "",
      tags: [] as string[],
      client: "",
      industry: "",
      result: "",
      at: "",
      order: 1,
    },
  ]);
};

// grantFromRequest 仅调用 headers.get("x-pay-grant")，用普通对象即可，避免依赖 Web Headers 全局
const reqWithGrant = (token: string) =>
  ({
    headers: { get: (n: string) => (n === "x-pay-grant" ? token : null) },
  }) as any;

beforeEach(() => {
  (getContents as Mock).mockReset();
  (getOrder as Mock).mockReset();
  (getPaymentProvider as Mock).mockReset();
});

describe("pay-access: SEC-01 fail-closed", () => {
  it("未配置商品 → 402", async () => {
    mockGetContents({}); // 没有 PID 的配置
    const r = await requirePaidAccess(reqWithGrant(""), PID);
    expect(r.ok).toBe(false);
    expect((r as any).status).toBe(402);
  });

  it("配置为付费但无票据 → 402 且带 amount", async () => {
    mockGetContents({ [PID]: { paid: true, amount: 10 } });
    const r = await requirePaidAccess(reqWithGrant(""), PID);
    expect(r.ok).toBe(false);
    expect((r as any).status).toBe(402);
    expect((r as any).amount).toBe(10);
  });
});

describe("pay-access: paid 模式", () => {
  it("持 paid 票据但无有效订单 → 403", async () => {
    mockGetContents({});
    (getOrder as Mock).mockResolvedValue(null);
    const token = signGrant({ pid: PID, oid: "o1", mode: "paid" });
    const r = await requirePaidAccess(reqWithGrant(token), PID);
    expect(r.ok).toBe(false);
    expect((r as any).status).toBe(403);
  });

  it("持 paid 票据且订单未支付(pending) → 403", async () => {
    mockGetContents({});
    (getOrder as Mock).mockResolvedValue({
      id: "o1",
      productId: PID,
      status: "pending",
    } as unknown as Order);
    const token = signGrant({ pid: PID, oid: "o1", mode: "paid" });
    const r = await requirePaidAccess(reqWithGrant(token), PID);
    expect(r.ok).toBe(false);
    expect((r as any).status).toBe(403);
  });

  it("持 paid 票据且订单已支付且商品一致 → 放行", async () => {
    mockGetContents({ [PID]: { paid: true, amount: 10 } });
    (getOrder as Mock).mockResolvedValue({
      id: "o1",
      productId: PID,
      status: "paid",
    } as unknown as Order);
    const token = signGrant({ pid: PID, oid: "o1", mode: "paid" });
    const r = await requirePaidAccess(reqWithGrant(token), PID);
    expect(r.ok).toBe(true);
    expect((r as any).mode).toBe("paid");
  });
});

describe("pay-access: SEC-02 free 票据复核", () => {
  it("free 票据但商品实则付费(paid:true) → 403", async () => {
    mockGetContents({ [PID]: { paid: true, amount: 10 } });
    const token = signGrant({ pid: PID, oid: "x", mode: "free" });
    const r = await requirePaidAccess(reqWithGrant(token), PID);
    expect(r.ok).toBe(false);
    expect((r as any).status).toBe(403);
  });
});

describe("pay-access: SEC-02 self 票据与真实通道互斥", () => {
  it("self 票据但存在真实支付通道(getPaymentProvider 非 null) → 403", async () => {
    mockGetContents({});
    (getPaymentProvider as Mock).mockReturnValue({ name: "mock" });
    const token = signGrant({ pid: PID, oid: "x", mode: "self" });
    const r = await requirePaidAccess(reqWithGrant(token), PID);
    expect(r.ok).toBe(false);
    expect((r as any).status).toBe(403);
  });

  it("self 票据且无真实通道 → 放行", async () => {
    mockGetContents({});
    (getPaymentProvider as Mock).mockReturnValue(null);
    const token = signGrant({ pid: PID, oid: "x", mode: "self" });
    const r = await requirePaidAccess(reqWithGrant(token), PID);
    expect(r.ok).toBe(true);
    expect((r as any).mode).toBe("self");
  });
});

describe("pay-access: free 商品直接放行", () => {
  it("商品确为免费(paid:false) → 放行（无需票据）", async () => {
    mockGetContents({ [PID]: { paid: false, amount: 0 } });
    const r = await requirePaidAccess(reqWithGrant(""), PID);
    expect(r.ok).toBe(true);
    expect((r as any).mode).toBe("free");
  });
});
