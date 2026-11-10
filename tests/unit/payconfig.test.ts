import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// 隔离数据层：用桩替换 getContents，验证 getPayConfig 的解析与回落逻辑。
vi.mock("@/lib/store", () => ({
  getContents: vi.fn(),
  saveContents: vi.fn(),
}));

import {
  getPayConfig,
  defaultPayConfig,
  BALANCE_PAY_ID,
  SCHED_PAY_ID,
  PAYCFG_ID,
} from "@/lib/payconfig";
import { getContents } from "@/lib/store";

const mkItem = (body: unknown) => ({
  id: PAYCFG_ID,
  type: "paycfg" as const,
  title: "",
  tag: "",
  summary: "",
  body: JSON.stringify(body),
  icon: "",
  tags: [] as string[],
  client: "",
  industry: "",
  result: "",
  at: "",
  order: 1,
});

describe("payconfig", () => {
  beforeEach(() => {
    (getContents as Mock).mockReset();
  });

  it("解析 items（paid/amount）", async () => {
    (getContents as Mock).mockResolvedValue([
      mkItem({
        qrImageUrl: "http://x/qr.png",
        qrNote: "扫码支付",
        items: { prod1: { paid: true, amount: 5 } },
      }),
    ]);
    const cfg = await getPayConfig();
    expect(cfg.qrImageUrl).toBe("http://x/qr.png");
    expect(cfg.qrNote).toBe("扫码支付");
    expect(cfg.items.prod1).toEqual({ paid: true, amount: 5 });
  });

  it("解析失败回落默认（items 为空）", async () => {
    (getContents as Mock).mockResolvedValue([mkItem("这不是 json {{{")]);
    const cfg = await getPayConfig();
    expect(cfg.items).toEqual({});
    expect(cfg.qrImageUrl).toBe("");
  });

  it("无配置条目回落默认", async () => {
    (getContents as Mock).mockResolvedValue([]);
    const cfg = await getPayConfig();
    expect(cfg).toEqual(defaultPayConfig());
  });

  it("defaultPayConfig() 返回合理默认值", () => {
    const d = defaultPayConfig();
    expect(d.qrImageUrl).toBe("");
    expect(d.qrNote).toBe("微信 / 支付宝 扫码支付");
    expect(d.items).toEqual({});
  });

  it("BALANCE_PAY_ID / SCHED_PAY_ID 常量存在", () => {
    expect(BALANCE_PAY_ID).toBe("balance");
    expect(SCHED_PAY_ID).toBe("sched");
  });
});
