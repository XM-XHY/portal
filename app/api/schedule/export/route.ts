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
    // 分享链接导出免费：分享令牌本身就是访问授权，持有有效 token 即可导出，
    // 不再要求收件人二次付费（付费仅发生在分享发布方 / 后台管理端）。
    state = await getShareSnapshot(token);
  } else {
    const admin = await getAdminFromCookie();
    if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (!can(admin, "schedule.manage"))
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    state = await getScheduleState();
  }
  if (!state || !state.result)
    return NextResponse.json({ error: "尚无课表，请先生成" }, { status: 400 });

  // 表格写出统一走 lib/sheet（exceljs），替换存在 high 漏洞且无补丁的 xlsx@0.18.5
  const sheetLib = await import("@/lib/sheet");
  const days = state.rules.days;
  const ppd = state.rules.periodsPerDay;
  const dayNames = Array.from({ length: days }, (_, i) => `周${"一二三四五六日"[i]}`);
  const teacherName = new Map(state.teachers.map((t) => [t.id, t.name]));
  const roomName = new Map(state.rooms.map((r) => [r.id, r.name]));
  const className = new Map(state.classes.map((c) => [c.id, c.name]));

  const sheets: import("@/lib/sheet").SheetSpec[] = [];

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
      const rows: string[][] = [];
      rows.push([`${labelOf(id)} 课表`, ...dayNames]);
      for (let p = 0; p < ppd; p++) {
        const time = state!.rules.periodTimes[p] || "";
        const row: string[] = [`第${p + 1}节\n${time}`];
        for (let d = 0; d < days; d++) row.push(cellText(g[d]?.[p] || null, view));
        rows.push(row);
      }
      // 列宽 / 行高
      sheets.push({
        name: `${labelOf(id)}`,
        rows,
        colWidths: [14, ...Array.from({ length: days }, () => 18)],
        rowHeights: [22, ...Array.from({ length: ppd }, () => 34)],
      });
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

  const buf = await sheetLib.buildWorkbookBuffer(sheets);
  const fname = encodeURIComponent(`课表_${new Date().toISOString().slice(0, 10)}.xlsx`);
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${fname}`,
    },
  });
}
