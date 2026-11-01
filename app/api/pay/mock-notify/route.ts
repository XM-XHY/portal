import { NextRequest, NextResponse } from "next/server";
import { getPaymentProvider } from "@/lib/payment";
import { getOrder, markOrderPaid } from "@/lib/orders";

export const dynamic = "force-dynamic";

/** 仅用于本地/开发（PAY_PROVIDER=mock）模拟支付成功，便于联调前端流程。生产真实支付走网关回调。 */
export async function POST(req: NextRequest) {
  const provider = getPaymentProvider();
  if (!provider || provider.name !== "mock") {
    return NextResponse.json({ error: "模拟支付仅在 mock 模式下可用" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const orderId: string = body.orderId;
  if (!orderId) return NextResponse.json({ error: "缺少 orderId" }, { status: 400 });
  const order = await getOrder(orderId);
  if (!order) return NextResponse.json({ error: "订单不存在" }, { status: 404 });
  await markOrderPaid(orderId, "MOCK" + Date.now());
  return NextResponse.json({ ok: true, status: "paid" });
}
