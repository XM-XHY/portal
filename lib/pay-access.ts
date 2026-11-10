/**
 * 付费下载的服务端门禁（所有受保护的资源接口统一调用）。
 *
 * 与前端 PayGate 配合：PayGate 只负责发起支付/展示二维码，
 * 真正的放行凭据是服务端在确认订单已支付后签发的 grant 票据。
 * 直接请求 /api/products/doc/xxx 或 /api/schedule/export?token=xxx 而没带票据的一律 402。
 */
import { getPayConfig } from "@/lib/payconfig";
import { getOrder } from "@/lib/orders";
import { grantFromRequest, verifyGrant, type GrantMode } from "@/lib/pay-grant";
import { getPaymentProvider } from "@/lib/payment";

export type AccessResult =
  | { ok: true; mode: GrantMode }
  | { ok: false; status: number; error: string; amount?: number };

export async function requirePaidAccess(
  req: { nextUrl?: URL; headers: Headers },
  productId: string
): Promise<AccessResult> {
  const cfg = await getPayConfig();
  const item = cfg.items?.[productId];

  // SEC-01（fail-closed）：只有在后台「明确配置为免费」(paid:false) 的商品才允许免费放行。
  // 其余情况（未配置 / 配置读不到 / 配置为付费 / DB 不可达导致 items 为空）一律要求持有效已支付票据，
  // 绝不在配置不可用时默认放行，避免付费墙在 DB 故障时整体敞开。
  if (item && item.paid === false) {
    return { ok: true, mode: "free" };
  }

  const token = grantFromRequest(req);
  const p = verifyGrant(token, productId);
  if (!p) {
    return {
      ok: false,
      status: 402,
      error: "该资源需先完成支付，请在页面点击下载/导出并完成付款",
      amount: item?.amount,
    };
  }

  // 付费票据必须对应一笔真实已支付订单，且商品一致
  if (p.mode === "paid") {
    const order = await getOrder(p.oid);
    if (!order || order.productId !== productId || order.status !== "paid") {
      return { ok: false, status: 403, error: "支付凭据无效或订单未支付" };
    }
    return { ok: true, mode: "paid" };
  }

  // SEC-02：free 票据需复核当前商品确实为免费，防止已付费商品被滞留的免费票据解锁
  if (p.mode === "free") {
    if (!(item && item.paid === false)) {
      return { ok: false, status: 403, error: "免费票据无效：该资源当前需付费" };
    }
    return { ok: true, mode: "free" };
  }

  // SEC-02：self 票据仅在「无真实商户通道」时由自助申报签发；真实通道启用后一律作废，避免绕过网关支付
  if (p.mode === "self") {
    if (getPaymentProvider()) {
      return { ok: false, status: 403, error: "该资源需通过支付网关完成付款" };
    }
    return { ok: true, mode: "self" };
  }

  return { ok: false, status: 403, error: "未知的票据类型" };
}
