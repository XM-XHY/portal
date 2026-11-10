import { NextRequest, NextResponse } from "next/server";
import { getAdminFromCookie, clientIp } from "@/lib/session";
import { can } from "@/lib/auth";
import {
  getScheduleState,
  saveScheduleState,
  detectConflicts,
  emptyState,
  type SchedState,
} from "@/lib/schedule";

export const dynamic = "force-dynamic";

/** 读取排课状态（含生成的课表与冲突） */
export async function GET() {
  const admin = await getAdminFromCookie();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!can(admin, "schedule.manage"))
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  return NextResponse.json(await getScheduleState(), { headers: { "Cache-Control": "no-store" } });
}

/** 保存排课状态（导入/规则/手动微调后调用；自动重算冲突） */
export async function PUT(req: NextRequest) {
  const admin = await getAdminFromCookie();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!can(admin, "schedule.manage"))
    return NextResponse.json({ error: "无权限" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Partial<SchedState>;
  const base = await getScheduleState();
  const merged: SchedState = {
    ...base,
    ...body,
    rules: { ...base.rules, ...(body.rules || {}) },
    result: body.result || base.result,
  };
  if (merged.result?.perClass) {
    merged.result.conflicts = detectConflicts(merged);
    merged.result.summary = merged.result.summary || "";
  }
  await saveScheduleState(merged);
  await import("@/lib/store").then((m) =>
    m.appendAudit({
      actor: admin.username,
      action: "schedule.save",
      target: "sched-main",
      ip: clientIp(req),
      detail: "保存排课状态",
    })
  );
  return NextResponse.json({ ok: true, conflicts: merged.result?.conflicts.length || 0 });
}
