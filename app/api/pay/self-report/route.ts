import { NextRequest, NextResponse } from "next/server";
import { getPayConfig } from "@/lib/payconfig";
import { getPaymentProvider } from "@/lib/payment";
import { signGrant } from "@/lib/pay-grant";
import { appendAudit } from "@/lib/store";
import { clientIp } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * 自助扫码收款的「付款申报」。
 *
 * 仅在【未配置真实商户通道 + 管理员上传了收款二维码】时可用。
 * 旧实现里用户点一下「我已完成支付」前端就直接放行，服务端没有任何记录，
 * 属于可随意绕过的付费墙。现在改为：申报必须打到服务端、写审计日志留痕，
 * 并由服务端签发一枚短期 self 票据，下载接口凭票据放行。
 *
 * 注意：自助收款无法由机器核对到账，管理员需在后台按审计日志/收款记录人工核对。
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const rl = await rateLimit(`selfreport:${ip}`, 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `申报过于频繁，请 ${rl.retryAfter} 秒后再试` },
      { status: 429 }
    );
  }

  const b = await req.json().catch(() => ({}));
  const productId = String(b?.productId || "").trim();
  if (!productId) return NextResponse.json({ error: "缺少 productId" }, { status: 400 });

  const cfg = await getPayConfig();
  const item = cfg.items?.[productId];
  if (!item || !item.paid || item.amount <= 0) {
    return NextResponse.json({ error: "该资源无需付款" }, { status: 400 });
  }
  // 真实商户通道可用时，必须走网关支付，禁止用自助申报绕过
  if (getPaymentProvider() || !cfg.qrImageUrl) {
    return NextResponse.json({ error: "当前不支持自助扫码申报，请使用页面支付二维码" }, { status: 403 });
  }

  await appendAudit({
    actor: "访客",
    action: "pay.self-report",
    target: `product:${productId}`,
    ip,
    detail: `自助扫码付款申报 ¥${item.amount}（需人工核对到账）`,
  });

  return NextResponse.json({
    ok: true,
    grant: signGrant({ pid: productId, oid: "self", mode: "self" }),
  });
}
