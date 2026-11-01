import { NextRequest, NextResponse } from "next/server";
import { getPaymentProvider } from "@/lib/payment";
import { newOrder, saveOrder, getOrder, expireOrder, type OrderProvider } from "@/lib/orders";
import { getPayConfig } from "@/lib/payconfig";
import { getContents } from "@/lib/store";

export const dynamic = "force-dynamic";

/** 解析商品名称（排课系统等内置工具 + 产品中心条目） */
async function resolveTitle(productId: string): Promise<string> {
  if (productId === "sched") return "智能排课系统";
  try {
    const list = await getContents("product");
    const it = list.find((x) => x.id === productId);
    if (it) return it.title || productId;
  } catch {}
  return productId;
}

function notifyBase(req: NextRequest): string {
  if (process.env.PAY_NOTIFY_BASE) return process.env.PAY_NOTIFY_BASE.replace(/\/$/, "");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "www.cnxhy.top";
  return `${proto}://${host}`;
}

/** 创建支付订单（公开，无需登录；匿名下单） */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const productId: string = body.productId;
  const client: string = body.client || "";
  if (!productId) return NextResponse.json({ error: "缺少 productId" }, { status: 400 });

  const cfg = await getPayConfig();
  const item = cfg.items?.[productId];
  // 未开启付费或金额<=0 → 免费放行
  if (!item || !item.paid || item.amount <= 0) {
    return NextResponse.json({ free: true });
  }

  const provider = getPaymentProvider();
  if (!provider) {
    // 降级：未配置真实商户通道，但管理员上传了自助收款二维码 -> 退回「自助扫码」模式，避免下载完全不可用
    if (cfg.qrImageUrl && item.paid && item.amount > 0) {
      return NextResponse.json({
        self: true,
        amount: item.amount,
        qrImageUrl: cfg.qrImageUrl,
        qrNote: cfg.qrNote || "微信 / 支付宝 扫码支付",
      });
    }
    return NextResponse.json({ error: "支付通道未配置，请联系管理员" }, { status: 503 });
  }

  const title = await resolveTitle(productId);
  try {
    const order = newOrder({
      productId,
      productTitle: title,
      amount: item.amount,
      provider: provider.name as OrderProvider,
      client,
    });
    const { codeUrl } = await provider.createNativePayment(order, notifyBase(req));
    order.codeUrl = codeUrl;
    await saveOrder(order);
    return NextResponse.json({
      orderId: order.id,
      codeUrl,
      amount: order.amount,
      provider: order.provider,
      expiresAt: order.expiresAt,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "创建订单失败" }, { status: 502 });
  }
}

/** 轮询订单状态（前端支付页轮询；公开，仅能看自己订单 id） */
export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  await expireOrder(id);
  const order = await getOrder(id);
  if (!order) return NextResponse.json({ error: "订单不存在" }, { status: 404 });
  return NextResponse.json({
    orderId: order.id,
    status: order.status,
    paid: order.status === "paid",
    amount: order.amount,
    productId: order.productId,
    expiresAt: order.expiresAt,
  });
}
