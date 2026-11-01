import { NextRequest, NextResponse } from "next/server";
import { getAdminFromCookie, clientIp } from "@/lib/session";
import { can } from "@/lib/auth";
import { getScheduleState, saveShareSnapshot } from "@/lib/schedule";
import { appendAudit } from "@/lib/store";

export const dynamic = "force-dynamic";

/** 创建只读分享链接（基于当前课表快照） */
export async function POST(req: NextRequest) {
  const admin = await getAdminFromCookie();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!can(admin.role, "schedule.manage"))
    return NextResponse.json({ error: "无权限" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { title?: string };
  const state = await getScheduleState();
  if (!state.result) return NextResponse.json({ error: "请先生成课表再分享" }, { status: 400 });

  const token = await saveShareSnapshot(state, body.title || "课表分享");
  const base = new URL(req.url).origin;
  const url = `${base}/schedule/share/${token}`;

  await appendAudit({
    actor: admin.username,
    action: "schedule.share",
    target: `share:${token}`,
    ip: clientIp(req),
    detail: body.title || "创建分享",
  });

  return NextResponse.json({ ok: true, token, url });
}
