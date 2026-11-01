// 真实支付订单：复用 contents 表（type=order），零 DDL。
// 订单生命周期：pending -> paid（网关回调确认）/ expired（超时未付）。
import type { ContentItem, ContentType } from "@/lib/data/types";
import { getContents, saveContents, newId } from "@/lib/store";

export const ORDER_TYPE: ContentType = "order";

export type OrderStatus = "pending" | "paid" | "expired";
export type OrderProvider = "wechat" | "alipay" | "mock";

export type Order = {
  id: string; // 商户订单号 outTradeNo（亦为 contents.id）
  productId: string;
  productTitle: string;
  amount: number; // 元
  amountFen: number; // 分（网关以分为单位）
  provider: OrderProvider;
  status: OrderStatus;
  codeUrl?: string; // 网关返回的扫码支付码（原生二维码内容）
  tradeNo?: string; // 网关交易流水号
  createdAt: string;
  expiresAt: string;
  paidAt?: string;
  client?: string; // 备注（如导出类型）
};

const EXPIRE_MIN = 15;

export function newOrder(params: {
  productId: string;
  productTitle: string;
  amount: number;
  provider: OrderProvider;
  codeUrl?: string;
  client?: string;
}): Order {
  const now = new Date();
  const exp = new Date(now.getTime() + EXPIRE_MIN * 60_000);
  const amount = Math.max(0, Math.round(params.amount * 100) / 100);
  return {
    id: newId("o"),
    productId: params.productId,
    productTitle: params.productTitle,
    amount,
    amountFen: Math.round(amount * 100),
    provider: params.provider,
    status: "pending",
    codeUrl: params.codeUrl,
    createdAt: now.toISOString(),
    expiresAt: exp.toISOString(),
    client: params.client,
  };
}

function toContent(o: Order): ContentItem {
  return {
    id: o.id,
    type: ORDER_TYPE,
    title: o.productTitle,
    tag: o.productId,
    summary: `${o.provider} ¥${o.amount} ${o.status}`,
    body: JSON.stringify(o),
    icon: "💳",
    tags: [],
    client: o.status,
    industry: "",
    result: String(o.amountFen),
    at: o.createdAt,
    order: 1,
  };
}

function fromContent(c: ContentItem): Order | null {
  try {
    return JSON.parse(c.body) as Order;
  } catch {
    return null;
  }
}

export async function saveOrder(o: Order): Promise<void> {
  const list = await getContents();
  const idx = list.findIndex((x) => x.id === o.id && x.type === ORDER_TYPE);
  const item = toContent(o);
  if (idx >= 0) list[idx] = item;
  else list.unshift(item);
  await saveContents(list);
}

export async function getOrder(id: string): Promise<Order | null> {
  const c = await getContents();
  const item = c.find((x) => x.id === id && x.type === ORDER_TYPE);
  return item ? fromContent(item) : null;
}

/** 标记已支付（幂等：已支付则直接返回原订单） */
export async function markOrderPaid(id: string, tradeNo: string): Promise<Order | null> {
  const o = await getOrder(id);
  if (!o) return null;
  if (o.status === "paid") return o;
  o.status = "paid";
  o.tradeNo = tradeNo || o.tradeNo;
  o.paidAt = new Date().toISOString();
  await saveOrder(o);
  return o;
}

/** 将超时未付订单标记为 expired（供定时/访问时清理） */
export async function expireOrder(id: string): Promise<void> {
  const o = await getOrder(id);
  if (!o || o.status !== "pending") return;
  if (new Date(o.expiresAt).getTime() < Date.now()) {
    o.status = "expired";
    await saveOrder(o);
  }
}
