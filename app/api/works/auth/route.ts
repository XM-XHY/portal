import { NextRequest, NextResponse } from "next/server";
import { getWorkUserId, signWorkSession, WORK_COOKIE, WORK_COOKIE_OPTIONS } from "@/lib/work-session";
import {
  registerUser,
  verifyLogin,
  resetPassword,
  buildWorkState,
  findUserByAccount,
} from "@/lib/work-db";
import { getOrder } from "@/lib/orders";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/session";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

/** 空状态：未登录时作品仍能正常渲染（本地缓存 + 注册引导） */
function anonymous() {
  return { loggedIn: false, user: null, auth: null, mistakes: {}, flywheel: [] };
}

/** 拉取云端权威状态：账号、试用/会员、错题库、飞轮 */
export async function GET() {
  const uid = await getWorkUserId();
  if (!uid) return NextResponse.json(anonymous(), { headers: NO_STORE });
  try {
    const state = await buildWorkState(uid);
    if (!state) {
      const res = NextResponse.json(anonymous(), { headers: NO_STORE });
      res.cookies.set(WORK_COOKIE, "", { ...WORK_COOKIE_OPTIONS, maxAge: 0 });
      return res;
    }
    return NextResponse.json({ loggedIn: true, ...state }, { headers: NO_STORE });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "读取账号数据失败" }, { status: 500, headers: NO_STORE });
  }
}

/**
 * C 端账号动作。密码只在 HTTPS 请求体里短暂出现，服务端立即用 PBKDF2 加盐哈希，
 * 明文不落库、不写日志。客户端无法通过这个接口改写试用/会员状态。
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");

  if (["register", "login", "reset"].includes(action)) {
    const rl = await rateLimit(`workauth:${clientIp(req)}`, 20, 60_000);
    if (!rl.ok) {
      return NextResponse.json({ error: `操作过于频繁，请 ${rl.retryAfter} 秒后再试` }, { status: 429, headers: NO_STORE });
    }
  }

  try {
    if (action === "register") {
      const user = await registerUser(body.account, body.password);
      const res = NextResponse.json({ ok: true, account: user.account }, { headers: NO_STORE });
      res.cookies.set(WORK_COOKIE, signWorkSession(user.id), WORK_COOKIE_OPTIONS);
      return res;
    }

    if (action === "login") {
      const user = await verifyLogin(body.account, body.password);
      const res = NextResponse.json({ ok: true, account: user.account }, { headers: NO_STORE });
      res.cookies.set(WORK_COOKIE, signWorkSession(user.id), WORK_COOKIE_OPTIONS);
      return res;
    }

    if (action === "logout") {
      const res = NextResponse.json({ ok: true, ...anonymous() }, { headers: NO_STORE });
      res.cookies.set(WORK_COOKIE, "", { ...WORK_COOKIE_OPTIONS, maxAge: 0 });
      return res;
    }

    if (action === "reset") {
      const account = String(body.account || "").trim();
      const target = await findUserByAccount(account);
      if (!target) return NextResponse.json({ error: "账号不存在" }, { status: 404, headers: NO_STORE });

      // 两条合法路径：① 当前已登录本人；② 换设备找回——用一笔本账号已支付的订单号核验
      const uid = await getWorkUserId();
      let allowed = uid === target.id;
      if (!allowed && body.orderId) {
        const o = await getOrder(String(body.orderId));
        if (o && o.status === "paid" && o.work?.userId === target.id) allowed = true;
      }
      if (!allowed) {
        return NextResponse.json(
          { error: "需要登录本人账号，或提供该账号的一笔已支付订单号" },
          { status: 403, headers: NO_STORE }
        );
      }
      await resetPassword(target.id, body.password);
      const res = NextResponse.json({ ok: true, account: target.account }, { headers: NO_STORE });
      res.cookies.set(WORK_COOKIE, signWorkSession(target.id), WORK_COOKIE_OPTIONS);
      return res;
    }

    if (action === "status") {
      const uid = await getWorkUserId();
      if (!uid) return NextResponse.json(anonymous(), { headers: NO_STORE });
      const state = await buildWorkState(uid);
      if (!state) return NextResponse.json(anonymous(), { headers: NO_STORE });
      return NextResponse.json({ loggedIn: true, ...state }, { headers: NO_STORE });
    }

    return NextResponse.json({ error: "未知操作" }, { status: 400, headers: NO_STORE });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "操作失败" }, { status: 400, headers: NO_STORE });
  }
}
