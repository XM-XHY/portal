import { NextRequest, NextResponse } from "next/server";
import { getPaymentProvider } from "@/lib/payment";
import { markOrderPaid } from "@/lib/orders";

export const dynamic = "force-dynamic";

/** 微信支付异步回调（V3）：验签 + 解密 + 标记订单已支付 */
export async function POST(req: NextRequest) {
  const provider = getPaymentProvider();
  if (!provider || provider.name !== "wechat") {
    return NextResponse.json({ code: "FAIL", message: "支付通道未配置" }, { status: 500 });
  }
  const raw = await req.text();
  const headers = Object.fromEntries(req.headers.entries());
  try {
    const r = await provider.verifyCallback(raw, headers);
    if (r.paid) await markOrderPaid(r.outTradeNo, r.tradeNo);
    const resp = provider.successResponse();
    return new NextResponse(resp.body, { status: 200, headers: { "Content-Type": resp.contentType } });
  } catch (e: any) {
    return NextResponse.json({ code: "FAIL", message: e.message || "校验失败" }, { status: 500 });
  }
}
