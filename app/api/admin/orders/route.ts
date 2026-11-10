import { NextRequest, NextResponse } from "next/server";
import { getAdminFromCookie } from "@/lib/session";
import { can } from "@/lib/auth";
import { listOrders, getOrder, markOrderPaid, addRefund, isFinalRefundStatus, type Order } from "@/lib/orders";
import { getPaymentProvider } from "@/lib/payment";
import { appendAudit } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * 后台订单列表（需登录 + order.manage）。
 * 支持 ?status=paid|pending|expired|refunded|all 与 ?q=关键词（订单号/商品/流水号）与 ?limit=
 */
export async function GET(req: NextRequest) {
  const admin = await getAdminFromCookie();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!can(admin, "order.manage")) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const status = (req.nextUrl.searchParams.get("status") || "all").trim();
  const q = (req.nextUrl.searchParams.get("q") || "").trim().toLowerCase();
  const limit = Math.min(2000, Math.max(1, Number(req.nextUrl.searchParams.get("limit") || 500)));

  let list = await listOrders();
  if (status && status !== "all") list = list.filter((o) => o.status === status);
  if (q) {
    list = list.filter((o) =>
      [o.id, o.productId, o.productTitle, o.tradeNo, o.provider, o.client]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }
  const sliced = list.slice(0, limit);

  const stat = {
    total: list.length,
    paidCount: list.filter((o) => o.status === "paid" || o.status === "refunding" || o.status === "refunded").length,
    paidAmount: round2(list.filter((o) => o.status === "paid" || o.status === "refunding" || o.status === "refunded").reduce((s, o) => s + o.amount, 0)),
    pendingCount: list.filter((o) => o.status === "pending").length,
    refundedAmount: round2(list.reduce((s, o) => s + (o.refundedAmount || 0), 0)),
  };

  return NextResponse.json({ ok: true, orders: sliced, stat, role: admin.role });
}

/**
 * 单笔查单：以微信网关状态为准更新本地订单（回调丢失时的兜底手段）。
 */
export async function POST(req: NextRequest) {
  const admin = await getAdminFromCookie();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!can(admin, "order.manage")) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const b = await req.json().catch(() => ({}));
  const id = String(b.id || "").trim();
  if (!id) return NextResponse.json({ error: "缺少订单号" }, { status: 400 });

  const o = await getOrder(id);
  if (!o) return NextResponse.json({ error: "订单不存在" }, { status: 404 });

  const provider = getPaymentProvider();

  /* ---------------- 同步退款状态（退款回调丢失时的兜底） ---------------- */
  if (String(b.action || "") === "sync-refund") {
    const refunds = o.refunds || [];
    if (!refunds.length) return NextResponse.json({ ok: true, order: o, note: "该订单没有退款记录" });
    if (!provider?.queryRefund) {
      return NextResponse.json({ error: "当前支付通道不支持主动查询退款" }, { status: 400 });
    }
    const wantNo = String(b.refundNo || "").trim();
    const notes: string[] = [];
    let cur = o;
    for (const r of refunds) {
      if (wantNo && r.refundNo !== wantNo) continue;
      if (isFinalRefundStatus(r.status)) {
        notes.push(`${r.refundNo}：${r.status}（终态，跳过）`);
        continue;
      }
      try {
        const qr = await provider.queryRefund(r.refundNo, o.id);
        cur =
          (await addRefund(o.id, {
            refundNo: r.refundNo,
            status: qr.status || r.status,
            amount: qr.amountFen ? Math.round(qr.amountFen) / 100 : r.amount,
            reason: r.reason,
            at: qr.successTime || r.at,
            gatewayRefundId: qr.gatewayRefundId || r.gatewayRefundId,
            failReason: qr.failReason,
          })) || cur;
        notes.push(`${r.refundNo}：${qr.status || "-"}`);
      } catch (e: any) {
        notes.push(`${r.refundNo}：查询失败（${e?.message || "未知错误"}）`);
      }
    }
    await appendAudit({
      actor: admin.username,
      action: "order.refund.sync",
      target: `order:${o.id}`,
      ip: clientIp(req),
      detail: notes.join(" / ") || "无",
    });
    return NextResponse.json({ ok: true, order: cur, note: notes.join(" / ") || "已同步" });
  }

  if (!provider?.queryOrder) {
    return NextResponse.json({ error: "当前支付通道不支持主动查单" }, { status: 400 });
  }

  try {
    const r = await provider.queryOrder(o.id);
    if (!r.found) {
      return NextResponse.json({ ok: true, order: o, note: "微信侧查无此订单（可能尚未被扫码）" });
    }
    if (r.paid && o.status !== "paid") {
      const updated = await markOrderPaid(o.id, r.tradeNo || "", r.amountFen);
      if (!updated) {
        return NextResponse.json({ error: "网关实付金额与订单金额不一致，已拒绝置为已支付" }, { status: 409 });
      }
      return NextResponse.json({ ok: true, order: updated, note: "已按微信状态更新为已支付" });
    }
    return NextResponse.json({
      ok: true,
      order: (await getOrder(id)) as Order,
      note: `微信状态：${r.state || "-"}（本地：${o.status}）`,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "查单失败" }, { status: 502 });
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}
