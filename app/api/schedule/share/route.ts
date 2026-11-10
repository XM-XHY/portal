import { NextRequest, NextResponse } from "next/server";
import { getAdminFromCookie, clientIp } from "@/lib/session";
import { can } from "@/lib/auth";
import {
  getScheduleState,
  saveShareSnapshot,
  listShares,
  setShareRevoked,
} from "@/lib/schedule";
import { appendAudit } from "@/lib/store";

export const dynamic = "force-dynamic";

function requireManage() {
  return getAdminFromCookie();
}

/** 列出历史分享链接（含已过期/已吊销，便于后台核对与吊销） */
export async function GET() {
  const admin = await requireManage();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!can(admin, "schedule.manage"))
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  return NextResponse.json(
    { items: await listShares() },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/** 创建只读分享链接（基于当前课表快照），默认 30 天有效 */
export async function POST(req: NextRequest) {
  const admin = await requireManage();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!can(admin, "schedule.manage"))
    return NextResponse.json({ error: "无权限" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    expiresDays?: number;
  };
  const state = await getScheduleState();
  if (!state.result) return NextResponse.json({ error: "请先生成课表再分享" }, { status: 400 });

  const expiresDays = Math.min(365, Math.max(1, Number(body.expiresDays) || 30));
  const token = await saveShareSnapshot(state, body.title || "课表分享", {
    owner: admin.username,
    expiresDays,
  });
  // 容器内 req.url 是内网地址，优先取配置的正式域名
  const envBase = process.env.PAY_NOTIFY_BASE || process.env.NEXT_PUBLIC_SITE_URL;
  const base = envBase ? envBase.replace(/\/+$/, "") : new URL(req.url).origin;
  const url = `${base}/schedule/share/${token}`;

  await appendAudit({
    actor: admin.username,
    action: "schedule.share",
    target: `share:${token}`,
    ip: clientIp(req),
    detail: `${body.title || "创建分享"} / ${expiresDays} 天有效`,
  });

  return NextResponse.json({ ok: true, token, url, expiresDays });
}

/** 吊销分享链接 ?token=xxx（可选 &restore=1 恢复） */
export async function DELETE(req: NextRequest) {
  const admin = await requireManage();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!can(admin, "schedule.manage"))
    return NextResponse.json({ error: "无权限" }, { status: 403 });

  const token = req.nextUrl.searchParams.get("token") || "";
  if (!token) return NextResponse.json({ error: "缺少 token" }, { status: 400 });
  const restore = req.nextUrl.searchParams.get("restore") === "1";
  const ok = await setShareRevoked(token, !restore);
  if (!ok) return NextResponse.json({ error: "分享链接不存在" }, { status: 404 });

  await appendAudit({
    actor: admin.username,
    action: restore ? "schedule.share.restore" : "schedule.share.revoke",
    target: `share:${token}`,
    ip: clientIp(req),
  });
  return NextResponse.json({ ok: true });
}
