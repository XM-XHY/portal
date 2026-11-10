import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * lib/orders 的订单生命周期与金额校验。
 *
 * 重点覆盖 SEC-05：支付回调必须携带与下单一致的实付金额，
 * 缺失 / 0 / 负数 / 不一致一律拒绝置为已付（防「小额单冒充大额单」造成资损）。
 * 以及重放安全：已付订单再次回调只做幂等返回，不重复置态。
 */

// vi.mock 会被提升到文件顶部，用 vi.hoisted 保证内存存储先就绪
const mem = vi.hoisted(() => ({ items: [] as any[] }));

vi.mock("@/lib/store", () => ({
  getContents: async () => mem.items,
  saveContents: async (items: any[]) => {
    mem.items = items;
  },
  newId: (prefix: string) => `${prefix}_test_${Math.random().toString(36).slice(2, 10)}`,
}));

import { newOrder, saveOrder, getOrder, markOrderPaid, listOrders } from "@/lib/orders";

function makeOrder(amountYuan = 30, productId = "paid_doc") {
  return newOrder({
    productId,
    productTitle: "测试商品",
    amount: amountYuan,
    provider: "wechat",
    codeUrl: "weixin://wxpay/bizpayurl?pr=test",
  });
}

beforeEach(() => {
  mem.items = [];
});

describe("订单创建与存取", () => {
  it("金额元→分转换正确（含小数四舍五入）", () => {
    const o = makeOrder(29.9);
    expect(o.amount).toBe(29.9);
    expect(o.amountFen).toBe(2990);
    expect(o.status).toBe("pending");
  });

  it("saveOrder → getOrder 往返保持字段一致", async () => {
    const o = makeOrder();
    o.work = { plan: "work_m", days: 30, userId: "u1", client: "c1", reqId: "r1" };
    await saveOrder(o);

    const back = await getOrder(o.id);
    expect(back).not.toBeNull();
    expect(back!.id).toBe(o.id);
    expect(back!.amountFen).toBe(o.amountFen);
    expect(back!.work?.userId).toBe("u1");
    expect(back!.work?.reqId).toBe("r1");
  });

  it("同一订单重复保存不产生重复记录", async () => {
    const o = makeOrder();
    await saveOrder(o);
    o.status = "paid";
    await saveOrder(o);
    const all = await listOrders();
    expect(all.filter((x) => x.id === o.id)).toHaveLength(1);
  });

  it("按创建时间倒序返回列表", async () => {
    const a = makeOrder(10, "p_a");
    await saveOrder(a);
    await new Promise((r) => setTimeout(r, 5));
    const b = makeOrder(20, "p_b");
    await saveOrder(b);
    const all = await listOrders();
    expect(all[0].id).toBe(b.id);
  });
});

describe("markOrderPaid：金额校验（SEC-05 核心）", () => {
  it("金额一致 → 置为已付并记录交易号与时间", async () => {
    const o = makeOrder(30);
    await saveOrder(o);

    const r = await markOrderPaid(o.id, "4200000000000000000000000001", 3000);
    expect(r).not.toBeNull();
    expect(r!.status).toBe("paid");
    expect(r!.tradeNo).toBe("4200000000000000000000000001");
    expect(r!.paidAt).toBeTruthy();

    const persisted = await getOrder(o.id);
    expect(persisted!.status).toBe("paid");
  });

  it("金额不一致（小额冒充大额）→ 拒绝，订单保持 pending", async () => {
    const o = makeOrder(30); // 3000 分
    await saveOrder(o);

    const r = await markOrderPaid(o.id, "T1", 1); // 只付 1 分
    expect(r).toBeNull();
    expect((await getOrder(o.id))!.status).toBe("pending");
  });

  it.each([
    ["缺失", undefined],
    ["为 0", 0],
    ["为负数", -3000],
    ["为 NaN", NaN],
  ])("金额%s → 拒绝置为已付", async (_label, amount) => {
    const o = makeOrder(30);
    await saveOrder(o);
    const r = await markOrderPaid(o.id, "T1", amount as number | undefined);
    expect(r).toBeNull();
    expect((await getOrder(o.id))!.status).toBe("pending");
  });

  it("订单不存在 → 返回 null（不抛异常）", async () => {
    await expect(markOrderPaid("o_not_exist", "T1", 3000)).resolves.toBeNull();
  });

  it("已过期订单不再回退为已付", async () => {
    const o = makeOrder(30);
    o.status = "expired";
    await saveOrder(o);
    expect(await markOrderPaid(o.id, "T1", 3000)).toBeNull();
  });

  it("重放同一回调 → 幂等返回，不覆盖首次的 paidAt", async () => {
    const o = makeOrder(30);
    await saveOrder(o);

    const first = await markOrderPaid(o.id, "T1", 3000);
    const firstPaidAt = first!.paidAt;

    await new Promise((r) => setTimeout(r, 10));
    const second = await markOrderPaid(o.id, "T1", 3000);

    expect(second!.status).toBe("paid");
    expect(second!.paidAt).toBe(firstPaidAt); // 未被重放刷新
  });

  it("已付订单收到不一致交易号 → 不篡改已记录交易号（仅告警）", async () => {
    const o = makeOrder(30);
    await saveOrder(o);
    await markOrderPaid(o.id, "T_ORIGINAL", 3000);

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await markOrderPaid(o.id, "T_DIFFERENT", 3000);
    expect(r!.tradeNo).toBe("T_ORIGINAL");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("已退款订单不会被回调重新置为已付", async () => {
    const o = makeOrder(30);
    o.status = "refunded";
    await saveOrder(o);
    const r = await markOrderPaid(o.id, "T1", 3000);
    expect(r!.status).toBe("refunded");
  });
});
