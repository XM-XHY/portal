import { NextRequest, NextResponse } from "next/server";
import { getPaymentProvider } from "@/lib/payment";
import { markOrderPaid } from "@/lib/orders";

export const dynamic = "force-dynamic";

/** 支付宝异步回调（当面付）：验签 + 标记订单已支付。支付宝要求响应纯文本 success */
export async function POST(req: NextRequest) {
  const provider = getPaymentProvider();
  if (!provider || provider.name !== "alipay") {
    return new NextResponse("failure", { status: 500, headers: { "Content-Type": "text/plain" } });
  }
  const raw = await req.text();
  try {
    const r = await provider.verifyCallback(raw, {});
    if (r.paid) await markOrderPaid(r.outTradeNo, r.tradeNo);
    const resp = provider.successResponse();
    return new NextResponse(resp.body, { status: 200, headers: { "Content-Type": resp.contentType } });
  } catch (e: any) {
    return new NextResponse("failure", { status: 500, headers: { "Content-Type": "text/plain" } });
  }
}
