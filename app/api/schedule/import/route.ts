import { NextRequest, NextResponse } from "next/server";
import { getAdminFromCookie, clientIp } from "@/lib/session";
import { can } from "@/lib/auth";
import {
  getScheduleState,
  saveScheduleState,
  parseImport,
  type TmplKind,
  type SchedState,
} from "@/lib/schedule";
import { appendAudit } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KINDS: TmplKind[] = ["teachers", "classes", "subjects", "rooms", "oldsched"];
const MAX_SIZE = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const admin = await getAdminFromCookie();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!can(admin, "schedule.manage"))
    return NextResponse.json({ error: "无权限" }, { status: 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "请求需为 multipart/form-data" }, { status: 400 });
  }

  const kind = String(form.get("kind") || "") as TmplKind;
  if (!KINDS.includes(kind))
    return NextResponse.json({ error: "未知的导入类型" }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "缺少文件字段 file" }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "文件超过 10MB 限制" }, { status: 400 });

  let parsed: any[];
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    parsed = (await parseImport(kind, buf)) as any[];
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "文件解析失败" },
      { status: 400 }
    );
  }
  if (!parsed.length) return NextResponse.json({ error: "未解析到任何数据行" }, { status: 400 });

  const state = await getScheduleState();
  const next = mergeInto(state, kind, parsed);
  await saveScheduleState(next);

  await appendAudit({
    actor: admin.username,
    action: "schedule.import",
    target: `sched:${kind}`,
    ip: clientIp(req),
    detail: `${file.name}（${parsed.length} 行）`,
  });

  return NextResponse.json({
    ok: true,
    kind,
    count: parsed.length,
    state: next,
  });
}

/** 按类型合并解析结果到状态（以 id / 组合键去重，新值覆盖旧值） */
function mergeInto(state: SchedState, kind: TmplKind, rows: any[]): SchedState {
  const s: SchedState = JSON.parse(JSON.stringify(state));
  if (kind === "teachers") {
    const map = new Map(s.teachers.map((t) => [t.id, t]));
    for (const r of rows) map.set(r.id, { ...(map.get(r.id) || {}), ...r });
    s.teachers = [...map.values()];
  } else if (kind === "classes") {
    const map = new Map(s.classes.map((c) => [c.id, c]));
    for (const r of rows) map.set(r.id, { ...(map.get(r.id) || {}), ...r });
    s.classes = [...map.values()];
  } else if (kind === "subjects") {
    const map = new Map(s.subjects.map((x) => [`${x.classId}|${x.subject}`, x]));
    for (const r of rows) map.set(`${r.classId}|${r.subject}`, { ...(map.get(`${r.classId}|${r.subject}`) || {}), ...r });
    s.subjects = [...map.values()];
  } else if (kind === "rooms") {
    const map = new Map(s.rooms.map((r) => [r.id, r]));
    for (const r of rows) map.set(r.id, { ...(map.get(r.id) || {}), ...r });
    s.rooms = [...map.values()];
  } else {
    // oldsched：按 (班级,星期,节次) 去重，后导入覆盖
    const map = new Map(s.oldSchedule.map((e) => [`${e.classId}|${e.day}|${e.period}`, e]));
    for (const r of rows) map.set(`${r.classId}|${r.day}|${r.period}`, r);
    s.oldSchedule = [...map.values()];
  }
  return s;
}
