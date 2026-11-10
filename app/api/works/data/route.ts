import { NextRequest, NextResponse } from "next/server";
import { getWorkUserId } from "@/lib/work-session";
import { replaceMistakes, replaceFlywheel } from "@/lib/work-db";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/session";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

/**
 * 作品学习数据上行。
 *
 * 只接受错题库与飞轮数据：**不接收 auth / users / 会员字段**，
 * 试用与权益完全由服务端根据订单计算，杜绝前端伪造 paidUntil 白嫖。
 * 错题库按学科整体覆盖，飞轮整体覆盖（数据量小，避免 identity 主键重复）。
 */
export async function POST(req: NextRequest) {
  const uid = await getWorkUserId();
  if (!uid) return NextResponse.json({ error: "请先登录" }, { status: 401, headers: NO_STORE });

  const rl = await rateLimit(`workdata:${clientIp(req)}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: `同步过于频繁，请 ${rl.retryAfter} 秒后再试` }, { status: 429, headers: NO_STORE });
  }

  const body = await req.json().catch(() => ({}));
  try {
    if (body.mistakes && typeof body.mistakes === "object") {
      await replaceMistakes(
        uid,
        String(body.mistakes.subject || ""),
        Array.isArray(body.mistakes.records) ? body.mistakes.records : []
      );
    }
    if (Array.isArray(body.flywheel)) {
      await replaceFlywheel(uid, body.flywheel);
    }
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "同步失败" }, { status: 500, headers: NO_STORE });
  }
}
