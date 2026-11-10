import { NextRequest, NextResponse } from "next/server";
import { getPaymentProvider } from "@/lib/payment";
import { newOrder, saveOrder, getOrder, listOrders } from "@/lib/orders";
import { getPayConfig } from "@/lib/payconfig";
import { getWorkUserId } from "@/lib/work-session";
import { grantEntitlement } from "@/lib/work-db";
import { getWorkPlan } from "@/lib/work-plans";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/session";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

/**
 * 作品会员支付兼容层（mathpay 协议 -> 主站微信支付）。
 *
 * 作品内部仍按 /create、/status、/claim 三个路径轮询，这里做协议适配：
 * 底层走主站同一个 `lib/payment.ts` 微信通道、同一张 contents(type=order) 订单表，
 * 因此后台订单列表能直接看到作品订单，也彻底关掉 mathpay 云函数写海外库的分叉。
 *
 * 权益由服务端在确认订单 paid 后幂等发放到 work_entitlements，
 * 客户端拿到的 plan/days 只用于展示，不参与服务端计时。
 */
function notifyBase(req: NextRequest): string {
  if (process.env.PAY_NOTIFY_BASE) return process.env.PAY_NOTIFY_BASE.replace(/\/$/, "");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "www.cnxhy.top";
  return `${proto}://${host}`;
}

type Ctx = { params: { action: string } };

export async function POST(req: NextRequest, { params }: Ctx) {
  const action = String(params.action || "");
  const body = await req.json().catch(() => ({}));

  if (action === "create") {
    const uid = await getWorkUserId();
    if (!uid) return NextResponse.json({ error: "请先注册 / 登录再开通会员" }, { status: 401, headers: NO_STORE });

    const rl = await rateLimit(`workpay:${clientIp(req)}`, 10, 60_000);
    if (!rl.ok) return NextResponse.json({ error: `下单过于频繁，请 ${rl.retryAfter} 秒后再试` }, { status: 429, headers: NO_STORE });

    const plan = getWorkPlan(String(body.plan || ""));
    if (!plan) return NextResponse.json({ error: "套餐不存在" }, { status: 400, headers: NO_STORE });

    const provider = getPaymentProvider();
    if (!provider) return NextResponse.json({ error: "支付通道未配置，请联系管理员" }, { status: 503, headers: NO_STORE });

    // P1：create 幂等键（前端 reqId）。同一账号 + reqId + client 的未过期未支付订单直接复用，
    // 避免网络重试 / 重复点击导致重复建单与重复支付。仅作用于 create 分支，claim 判定不受影响。
    const reqId = String(body.reqId || "").trim();
    if (reqId) {
      const client = String(body.client || "").slice(0, 80);
      const dup = (await listOrders()).find(
        (o) =>
          o.work?.userId === uid &&
          o.work?.reqId === reqId &&
          o.work?.client === client &&
          o.status === "pending" &&
          new Date(o.expiresAt).getTime() > Date.now()
      );
      if (dup && dup.work) {
        const p = getWorkPlan(dup.work.plan);
        return NextResponse.json(
          {
            orderId: dup.id,
            codeUrl: dup.codeUrl,
            expiresAt: dup.expiresAt,
            amount: dup.amount,
            plan: dup.work.plan,
            days: dup.work.days,
            planName: p?.name || "会员",
            idempotent: true,
          },
          { headers: NO_STORE }
        );
      }
    }

    // 价格优先读后台「产品付费」配置，未配置时用套餐默认价
    const cfg = await getPayConfig();
    const item = cfg.items?.[plan.payKey];
    const amount = item?.paid && item.amount > 0 ? item.amount : plan.defaultAmount;

    try {
      const order = newOrder({
        productId: plan.payKey,
        productTitle: `全科提分导师 · ${plan.name}`,
        amount,
        provider: provider.name as "wechat" | "alipay" | "mock",
        client: String(body.client || "").slice(0, 80),
      });
      order.work = {
        plan: plan.id,
        days: plan.days,
        userId: uid,
        client: String(body.client || "").slice(0, 80),
        reqId: reqId || undefined,
      };
      const { codeUrl } = await provider.createNativePayment(order, notifyBase(req));
      order.codeUrl = codeUrl;
      await saveOrder(order);
      return NextResponse.json(
        {
          orderId: order.id,
          codeUrl,
          expiresAt: order.expiresAt,
          amount: order.amount,
          plan: plan.id,
          days: plan.days,
          planName: plan.name,
        },
        { headers: NO_STORE }
      );
    } catch (e: any) {
      return NextResponse.json({ error: e.message || "创建订单失败" }, { status: 502, headers: NO_STORE });
    }
  }

  if (action === "claim") {
    const uid = await getWorkUserId();
    if (!uid) return NextResponse.json({ error: "请先登录" }, { status: 401, headers: NO_STORE });
    const o = await getOrder(String(body.orderId || ""));
    if (!o) return NextResponse.json({ error: "订单不存在" }, { status: 404, headers: NO_STORE });
    if (o.status !== "paid") return NextResponse.json({ error: "订单尚未支付" }, { status: 400, headers: NO_STORE });
    if (!o.work) return NextResponse.json({ error: "该订单不是会员订单" }, { status: 400, headers: NO_STORE });

    // SEC-04：会员权益按账号绑定，必须以「购买账号」领取；
    // 不再允许仅凭客户端自报的 device 字符串越权领取（client 由前端自报、未经验证）。
    if (o.work.userId !== uid) {
      return NextResponse.json(
        { error: "该订单绑定在其他账号，请登录购买时的账号领取；如需协助请联系客服" },
        { status: 403, headers: NO_STORE }
      );
    }

    try {
      const ent = await grantEntitlement(uid, o.work.plan, o.work.days, o.id);
      if (ent.user_id !== uid) {
        return NextResponse.json({ error: "该订单已由其他账号领取" }, { status: 403, headers: NO_STORE });
      }
      const plan = getWorkPlan(o.work.plan);
      return NextResponse.json(
        { paid: true, plan: o.work.plan, days: o.work.days, planName: plan?.name || "会员" },
        { headers: NO_STORE }
      );
    } catch (e: any) {
      return NextResponse.json({ error: e.message || "激活失败" }, { status: 500, headers: NO_STORE });
    }
  }

  return NextResponse.json({ error: "未知操作" }, { status: 404, headers: NO_STORE });
}

export async function GET(req: NextRequest, { params }: Ctx) {
  if (String(params.action || "") !== "status") {
    return NextResponse.json({ error: "未知操作" }, { status: 404, headers: NO_STORE });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少订单号" }, { status: 400, headers: NO_STORE });

  const o = await getOrder(id);
  if (!o) return NextResponse.json({ error: "订单不存在" }, { status: 404, headers: NO_STORE });

  const paid = o.status === "paid";
  const plan = o.work ? getWorkPlan(o.work.plan) : null;
  let granted = false;
  let reason = "";

  if (paid && o.work) {
    const uid = await getWorkUserId();
    if (!uid) {
      reason = "登录状态已失效，请重新登录后再查询";
    } else if (uid !== o.work.userId) {
      reason = "该订单绑定在其他账号，请登录购买时的账号";
    } else {
      try {
        await grantEntitlement(uid, o.work.plan, o.work.days, o.id);
        granted = true;
      } catch (e: any) {
        reason = e.message || "权益发放失败";
      }
    }
  }

  return NextResponse.json(
    {
      // 只有「订单已付 + 权益确实发到当前账号」才返回 paid=true，
      // 避免他人拿到订单号后在别的浏览器靠本地缓存解锁
      paid: paid && granted,
      orderPaid: paid,
      granted,
      reason: reason || undefined,
      plan: o.work?.plan,
      days: o.work?.days,
      planName: plan?.name || "会员",
      expiresAt: o.expiresAt,
      amount: o.amount,
      status: o.status,
    },
    { headers: NO_STORE }
  );
}
