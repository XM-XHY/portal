import { NextRequest, NextResponse } from "next/server";
import { getAdminFromCookie, clientIp } from "@/lib/session";
import { can } from "@/lib/auth";
import {
  getScheduleState,
  saveScheduleState,
  generateSchedule,
} from "@/lib/schedule";
import { appendAudit } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const admin = await getAdminFromCookie();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!can(admin.role, "schedule.manage"))
    return NextResponse.json({ error: "无权限" }, { status: 403 });

  const state = await getScheduleState();
  if (!state.classes.length || !state.subjects.length)
    return NextResponse.json(
      { error: "请先导入「班级名册」与「科目课时」，再生成课表" },
      { status: 400 }
    );

  const result = generateSchedule(state);
  state.result = result;
  await saveScheduleState(state);

  await appendAudit({
    actor: admin.username,
    action: "schedule.generate",
    target: "sched-main",
    ip: clientIp(req),
    detail: `生成课表，冲突 ${result.conflicts.length} 处`,
  });

  return NextResponse.json({ ok: true, result });
}
