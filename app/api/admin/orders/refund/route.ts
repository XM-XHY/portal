import { NextRequest, NextResponse } from "next/server";
import { getAdminFromCookie } from "@/lib/session";
import { can } from "@/lib/auth";
import { getOrder, addRefund, isFinalRefundStatus, type Order } from "@/lib/orders";
import { getPaymentProvider } from "@/lib/payment";
import { appendAudit } from "@/lib/store";

export const dynamic = "force-dynamic";

/** 退款单号：R + 时间戳 + 4 位随机（微信要求同一商户号下唯一） */
function newRefundNo(): string {
  return "R" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function notifyBase(): string | undefined {
  return process.env.PAY_NOTIFY_BASE ? process.env.PAY_NOTIFY_BASE.replace(/\/+$/, "") : undefined;
}

/**
 * 订单退款（需登录 + order.manage）。
 * body: { id, amount?, reason? } —— amount 省略表示全额退款。
 */
export async function POST(req: NextRequest) {
  const admin = await getAdminFromCookie();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!can(admin, "order.manage")) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const b = await req.json().catch(() => ({}));
  const id = String(b.id || "").trim();
  const reason = String(b.reason || "管理员后台退款").slice(0, 60);
  if (!id) return NextResponse.json({ error: "缺少订单号" }, { status: 400 });

  const o = await getOrder(id);
  if (!o) return NextResponse.json({ error: "订单不存在" }, { status: 404 });
  if (o.status === "pending" || o.status === "expired") {
    return NextResponse.json({ error: "未支付的订单无需退款" }, { status: 400 });
  }

  const already = o.refundedAmount || 0;
  const remain = Math.round((o.amount - already) * 100) / 100;
  if (remain <= 0) return NextResponse.json({ error: "该订单已全额退款" }, { status: 400 });

  const wantRaw = b.amount === undefined || b.amount === null || b.amount === "" ? remain : Number(b.amount);
  const want = Math.round(wantRaw * 100) / 100;
  if (!Number.isFinite(want) || want <= 0) {
    return NextResponse.json({ error: "退款金额不合法" }, { status: 400 });
  }
  if (want > remain + 0.001) {
    return NextResponse.json({ error: `可退金额上限为 ¥${remain}` }, { status: 400 });
  }

  const provider = getPaymentProvider();
  if (!provider?.refund) {
    return NextResponse.json({ error: "当前支付通道不支持在线退款，请在商户平台手动处理" }, { status: 400 });
  }

  const refundNo = newRefundNo();
  try {
    const r = await provider.refund({
      outTradeNo: o.id,
      outRefundNo: refundNo,
      totalFen: o.amountFen,
      refundFen: Math.round(want * 100),
      reason,
      notifyBase: notifyBase(),
    });

    // 回查确认最终状态：退款申请返回时通常还是 PROCESSING，
    // 零钱退款一般几秒内到账，故做几次短间隔轮询；拿不到终态也先按受理结果入库
    // （后续由退款回调 / 后台「同步退款」补正，addRefund 支持状态更新）。
    let finalStatus = r.status;
    let gatewayId = r.gatewayRefundId;
    let successTime: string | undefined;
    let failReason: string | undefined;
    if (provider.queryRefund) {
      for (let i = 0; i < 4 && !isFinalRefundStatus(finalStatus); i++) {
        await new Promise((res) => setTimeout(res, i === 0 ? 800 : 1500));
        try {
          const qr = await provider.queryRefund(refundNo, o.id);
          finalStatus = qr.status || finalStatus;
          gatewayId = qr.gatewayRefundId || gatewayId;
          successTime = qr.successTime;
          failReason = qr.failReason;
        } catch {
          // 回查失败不影响受理结果，按受理状态记录
          break;
        }
      }
    }

    const updated = await addRefund(o.id, {
      refundNo,
      status: finalStatus,
      amount: want,
      reason,
      at: successTime || new Date().toISOString(),
      gatewayRefundId: gatewayId,
      failReason: failReason,
    });

    await appendAudit({
      actor: admin.username,
      action: finalStatus === "SUCCESS" ? "order.refund" : "order.refund.submit",
      target: `order:${o.id}`,
      ip: clientIp(req),
      detail: `退款 ¥${want} / 状态 ${finalStatus}${gatewayId ? " / 网关单号 " + gatewayId : ""}${reason ? " / " + reason : ""}`,
    });

    return NextResponse.json({
      ok: true,
      order: updated as Order,
      refund: { refundNo, status: finalStatus, amount: want, gatewayRefundId: gatewayId },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "退款失败" }, { status: 502 });
  }
}
