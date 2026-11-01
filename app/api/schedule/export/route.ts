import { NextRequest, NextResponse } from "next/server";
import { getAdminFromCookie } from "@/lib/session";
import { can } from "@/lib/auth";
import {
  getScheduleState,
  getShareSnapshot,
  buildTeacherView,
  buildRoomView,
  type SchedState,
  type Cell,
} from "@/lib/schedule";

export const dynamic = "force-dynamic";

/** 生成 Excel 课表（全校：每班一表 + 教师课表 + 教室课表） */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const kind = url.searchParams.get("kind") || "all"; // all | class | teacher | room

  let state: SchedState | null = null;
  if (token) {
    state = await getShareSnapshot(token);
  } else {
    const admin = await getAdminFromCookie();
    if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (!can(admin.role, "schedule.manage"))
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    state = await getScheduleState();
  }
  if (!state || !state.result)
    return NextResponse.json({ error: "尚无课表，请先生成" }, { status: 400 });

  const XLSX = await import("xlsx");
  const days = state.rules.days;
  const ppd = state.rules.periodsPerDay;
  const dayNames = Array.from({ length: days }, (_, i) => `周${"一二三四五六日"[i]}`);
  const teacherName = new Map(state.teachers.map((t) => [t.id, t.name]));
  const roomName = new Map(state.rooms.map((r) => [r.id, r.name]));
  const className = new Map(state.classes.map((c) => [c.id, c.name]));

  const wb = XLSX.utils.book_new();

  function cellText(cell: Cell, view: "class" | "teacher" | "room"): string {
    if (!cell) return "";
    const subj = cell.subject || "";
    let extra = "";
    if (view === "class") {
      const t = cell.teacherId ? teacherName.get(cell.teacherId) || cell.teacherId : "";
      const r = cell.roomId ? roomName.get(cell.roomId) || cell.roomId : "";
      extra = [t, r].filter(Boolean).join(" · ");
    } else if (view === "teacher") {
      const c = cell.teacherId ? className.get(cell.teacherId) || cell.teacherId : "";
      const r = cell.roomId ? roomName.get(cell.roomId) || cell.roomId : "";
      extra = [c, r].filter(Boolean).join(" · ");
    } else {
      const c = cell.teacherId ? className.get(cell.teacherId) || cell.teacherId : "";
      const t = cell.roomId ? teacherName.get(cell.roomId) || cell.roomId : "";
      extra = [c, t].filter(Boolean).join(" · ");
    }
    return extra ? `${subj}\n${extra}` : subj;
  }

  function addSheet(name: string, grid: Record<string, Cell[][]>, labelOf: (id: string) => string, view: "class" | "teacher" | "room") {
    const ids = Object.keys(grid);
    if (!ids.length) return;
    for (const id of ids) {
      const g = grid[id];
      const rows: any[] = [];
      rows.push([`${labelOf(id)} 课表`, ...dayNames]);
      for (let p = 0; p < ppd; p++) {
        const time = state!.rules.periodTimes[p] || "";
        const row: any[] = [`第${p + 1}节\n${time}`];
        for (let d = 0; d < days; d++) row.push(cellText(g[d]?.[p] || null, view));
        rows.push(row);
      }
      const ws = XLSX.utils.aoa_to_sheet(rows);
      // 列宽 / 行高
      ws["!cols"] = [{ wch: 14 }, ...Array.from({ length: days }, () => ({ wch: 18 }))];
      ws["!rows"] = [{ hpt: 22 }, ...Array.from({ length: ppd }, () => ({ hpt: 34 }))];
      XLSX.utils.book_append_sheet(wb, ws, `${labelOf(id)}`.slice(0, 28));
    }
  }

  if (kind !== "teacher" && kind !== "room") {
    addSheet("班级", state.result.perClass, (id) => className.get(id) || id, "class");
  }
  if (kind !== "class") {
    const tv = buildTeacherView(state);
    addSheet("教师", tv, (id) => teacherName.get(id) || id, "teacher");
    const rv = buildRoomView(state);
    addSheet("教室", rv, (id) => roomName.get(id) || id, "room");
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const fname = encodeURIComponent(`课表_${new Date().toISOString().slice(0, 10)}.xlsx`);
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${fname}`,
    },
  });
}
