// 真实支付订单：复用 contents 表（type=order），零 DDL。
// 订单生命周期：pending -> paid（网关回调确认）/ expired（超时未付）。
import type { ContentItem, ContentType } from "@/lib/data/types";
import { getContents, saveContents, newId } from "@/lib/store";

export const ORDER_TYPE: ContentType = "order";

export type OrderStatus = "pending" | "paid" | "expired" | "refunding" | "refunded";
export type OrderProvider = "wechat" | "alipay" | "mock";

/** 退款记录（同一订单可能多次部分退款，故用数组） */
export type RefundRecord = {
  /** 商户退款单号 */
  refundNo: string;
  /** 网关退款状态：SUCCESS / PROCESSING / ABNORMAL / CLOSED / FAILED */
  status: string;
  /** 退款金额（元） */
  amount: number;
  /** 退款原因 */
  reason?: string;
  /** 发起时间 */
  at: string;
  /** 网关退款流水号 */
  gatewayRefundId?: string;
  /** 失败原因 */
  failReason?: string;
};

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
  /** 幂等键：前端在 create 时携带，用于避免网络重试/重复点击导致的重复建单（配合 client 唯一） */
  reqId?: string;
  refunds?: RefundRecord[]; // 退款记录
  /** 累计已退金额（元） */
  refundedAmount?: number;
  /** 作品中心会员订单的归属信息（仅服务端写入，用于支付成功后幂等发放权益） */
  work?: {
    plan: string;
    days: number;
    userId: string;
    client: string;
    /** 前端幂等键：同一账号 + reqId 的重复下单返回同一张未支付订单 */
    reqId?: string;
  };
};

const EXPIRE_MIN = 15;

export function newOrder(params: {
  productId: string;
  productTitle: string;
  amount: number;
  provider: OrderProvider;
  codeUrl?: string;
  client?: string;
  /** 幂等键（前端 create 时携带），仅透传存储，不参与金额/安全判定 */
  reqId?: string;
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
    reqId: params.reqId,
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

/**
 * 标记已支付。
 *
 * 安全：网关回调必须带上实付金额（分），与下单金额不一致时拒绝置为已付，
 * 防止「改价 / 篡改金额 / 用小额订单冒充」造成资损；过期订单与已退款订单也不再回退状态。
 * 幂等：已支付直接返回原订单。
 */
export async function markOrderPaid(
  id: string,
  tradeNo: string,
  paidAmountFen?: number
): Promise<Order | null> {
  const o = await getOrder(id);
  if (!o) return null;
  // SEC-05：回调必须携带与下单一致的实付金额（分）；缺失 / 非正 / 不一致一律拒绝置为已付，
  // 杜绝「传入 0 / 负 / 不传金额」绕过金额校验造成资损。
  if (typeof paidAmountFen !== "number" || paidAmountFen <= 0 || paidAmountFen !== o.amountFen) {
    console.error(
      `[orders] 回调金额校验失败，拒绝置为已付：order=${id} expect=${o.amountFen} got=${paidAmountFen}`
    );
    return null;
  }
  // 重放安全：订单已是终态时直接返回原订单（幂等），不重复置态、不重复发放权益。
  // 因报文由网关私钥签名、且带 out_trade_no 与实付金额，重放同一报文只会命中同一订单，
  // 故不单独引入时间窗（网关重试最长 24h，时间窗会误伤正常重试）。此处对异常交易号做告警留痕。
  if (o.status === "paid" || o.status === "refunded" || o.status === "refunding") {
    if (o.status === "paid" && tradeNo && o.tradeNo && o.tradeNo !== tradeNo) {
      console.error(
        `[orders] 已付订单收到不一致的交易号（可能的回调重放或串单）：order=${id} recorded=${o.tradeNo} incoming=${tradeNo}`
      );
    }
    return o;
  }
  if (o.status === "expired") return null;
  o.status = "paid";
  o.tradeNo = tradeNo || o.tradeNo;
  o.paidAt = new Date().toISOString();
  await saveOrder(o);
  return o;
}

/** 列出全部订单（按创建时间倒序） */
export async function listOrders(): Promise<Order[]> {
  const list = await getContents();
  return list
    .filter((x) => x.type === ORDER_TYPE)
    .map(fromContent)
    .filter((o): o is Order => !!o)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** 退款状态是否已终态（不再变化） */
export function isFinalRefundStatus(s?: string): boolean {
  const v = String(s || "").toUpperCase();
  return v === "SUCCESS" || v === "CLOSED" || v === "ABNORMAL" || v === "FAILED";
}

/**
 * 记录 / 更新一次退款（幂等：同一 refundNo 不重复累加）。
 *
 * ⚠️ 必须「更新」而不能「跳过」：退款申请接口返回时通常还是 PROCESSING，
 * 真正结果由退款回调（或主动回查）稍后送达。若这里只判重不更新，
 * 订单状态会永远停在 PROCESSING、refundedAmount 永远为 0。
 * 状态只向前推进：已到终态的记录不会被回退成 PROCESSING。
 */
export async function addRefund(id: string, rec: RefundRecord): Promise<Order | null> {
  const o = await getOrder(id);
  if (!o) return null;
  o.refunds = o.refunds || [];
  const i = o.refunds.findIndex((r) => r.refundNo === rec.refundNo);
  if (i >= 0) {
    const prev = o.refunds[i];
    const keepOld = isFinalRefundStatus(prev.status) && !isFinalRefundStatus(rec.status);
    o.refunds[i] = {
      ...prev,
      ...rec,
      // 原因/时间：新值缺失时保留旧值；SUCCESS 时以网关 success_time 为准
      reason: rec.reason || prev.reason,
      at: rec.status === "SUCCESS" ? rec.at || prev.at : prev.at || rec.at,
      amount: rec.amount > 0 ? rec.amount : prev.amount,
      status: keepOld ? prev.status : rec.status || prev.status,
      failReason: rec.failReason ?? prev.failReason,
    };
  } else {
    o.refunds.push(rec);
  }
  o.refundedAmount = round2(
    o.refunds.filter((r) => r.status === "SUCCESS").reduce((s, r) => s + r.amount, 0)
  );
  if (o.refundedAmount >= o.amount - 0.001) o.status = "refunded";
  else if (o.refundedAmount > 0) o.status = "refunding";
  await saveOrder(o);
  return o;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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
