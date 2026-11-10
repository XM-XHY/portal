import { NextRequest, NextResponse } from "next/server";
import { getPaymentProvider } from "@/lib/payment";
import { getOrder, addRefund } from "@/lib/orders";
import { appendAudit } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * 微信退款结果通知：接收后更新订单退款状态。
 * 未配置支付通道或验签失败时返回错误，微信会重试；不影响退款本身（受理即已生效）。
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const headers: Record<string, string | undefined> = {
    "wechatpay-timestamp": req.headers.get("wechatpay-timestamp") || undefined,
    "wechatpay-nonce": req.headers.get("wechatpay-nonce") || undefined,
    "wechatpay-signature": req.headers.get("wechatpay-signature") || undefined,
    "wechatpay-serial": req.headers.get("wechatpay-serial") || undefined,
  };

  const provider = getPaymentProvider();
  if (!provider?.verifyNotify) {
    return NextResponse.json({ code: "FAIL", message: "通道不支持" }, { status: 400 });
  }

  let data: Record<string, any>;
  try {
    data = await provider.verifyNotify(raw, headers);
  } catch (e: any) {
    console.warn("[refund-notify] 验签/解密失败:", e?.message);
    return NextResponse.json({ code: "FAIL", message: "签名校验失败" }, { status: 401 });
  }

  // 退款通知字段：out_trade_no / out_refund_no / refund_status / refund_id / amount{refund,total} / success_time
  const outTradeNo = String(data.out_trade_no || "");
  const outRefundNo = String(data.out_refund_no || "");
  const status = String(data.refund_status || "");
  if (!outTradeNo || !outRefundNo) {
    return NextResponse.json({ code: "FAIL", message: "缺少单号" }, { status: 400 });
  }

  const o = await getOrder(outTradeNo);
  if (!o) {
    return NextResponse.json({ code: "FAIL", message: "订单不存在" }, { status: 404 });
  }

  const refundFen = Number(data.amount?.refund || 0);
  const amount = Math.round((refundFen / 100) * 100) / 100;
  await addRefund(o.id, {
    refundNo: outRefundNo,
    status,
    amount: amount || o.amount,
    reason: o.refunds?.find((r) => r.refundNo === outRefundNo)?.reason,
    at: data.success_time || new Date().toISOString(),
    gatewayRefundId: data.refund_id,
  });

  await appendAudit({
    actor: "wechat",
    action: "order.refund.notify",
    target: `order:${o.id}`,
    ip: "wechat",
    detail: `退款通知 ${status} ¥${amount || o.amount}${data.refund_id ? " / " + data.refund_id : ""}`,
  });

  return NextResponse.json({ code: "SUCCESS", message: "成功" });
}
