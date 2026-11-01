// 学校排课系统：状态模型、文件解析、半自动排课引擎、状态读写。
// 存储复用 contents 表（type = "sched" / "sched_share"），零 DDL。

import type { ContentItem, ContentType } from "@/lib/data/types";
import { getContents, saveContents, newId } from "@/lib/store";

/* ============== 类型 ============== */

export type SchedTeacher = {
  id: string;
  name: string;
  subjects: string[]; // 可授科目
  maxHours: number; // 周最大课时
  unavailable: string[]; // 不排课节次，格式 "1-3" 表示周一第3节（day-period）
};

export type SchedClass = { id: string; name: string; size: number };

export type SchedSubject = {
  classId: string;
  subject: string;
  hoursPerWeek: number;
  needLab: boolean;
};

export type SchedRoom = {
  id: string;
  name: string;
  capacity: number;
  type: "普通" | "实验室";
};

export type OldEntry = {
  classId: string;
  day: number; // 1..7
  period: number; // 1..12
  subject: string;
  teacherId: string;
  roomId: string;
};

export type SchedRules = {
  days: number; // 每周天数 5/6/7
  periodsPerDay: number; // 每天节次
  periodTimes: string[]; // 每节起止时间，如 "08:00-08:45"
  connect: boolean; // 允许 2 节连排
  sportSpread: boolean; // 体育课不连天
  inheritOld: boolean; // 继承旧课表
  sportSubjects: string[]; // 视为体育的科目名
};

export type Cell = { subject: string; teacherId?: string; roomId?: string } | null;

export type Conflict = {
  type: "teacher" | "room";
  key: string; // 教师/教室 ID
  day: number;
  period: number;
  classIds: string[];
  detail: string;
};

export type SchedResult = {
  perClass: Record<string, Cell[][]>; // classId -> [day][period]
  conflicts: Conflict[];
  generatedAt: string;
  summary: string;
};

export type SchedState = {
  teachers: SchedTeacher[];
  classes: SchedClass[];
  subjects: SchedSubject[];
  rooms: SchedRoom[];
  oldSchedule: OldEntry[];
  rules: SchedRules;
  result: SchedResult | null;
  updatedAt: string;
};

export const SCHED_TYPE: ContentType = "sched";
export const SCHED_SHARE_TYPE: ContentType = "sched_share";
const SCHED_MAIN_ID = "sched-main";

export function emptyState(): SchedState {
  const periods = defaultPeriodTimes(8);
  return {
    teachers: [],
    classes: [],
    subjects: [],
    rooms: [],
    oldSchedule: [],
    rules: {
      days: 5,
      periodsPerDay: 8,
      periodTimes: periods,
      connect: true,
      sportSpread: true,
      inheritOld: true,
      sportSubjects: ["体育", "体育课", "体育与健康", "体锻"],
    },
    result: null,
    updatedAt: new Date().toISOString(),
  };
}

export function defaultPeriodTimes(n: number): string[] {
  const start = 8 * 60; // 08:00
  const len = 45;
  const gap = 10;
  const out: string[] = [];
  let t = start;
  for (let i = 0; i < n; i++) {
    const s = fmt(t);
    const e = fmt(t + len);
    out.push(`${s}-${e}`);
    t = t + len + gap;
    if (i === 3) t += 20; // 午休
  }
  return out;
}
function fmt(m: number): string {
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/* ============== 状态读写（复用 contents 表） ============== */

export async function getScheduleState(): Promise<SchedState> {
  const list = await getContents(SCHED_TYPE);
  const item = list.find((x) => x.id === SCHED_MAIN_ID);
  if (!item || !item.body) return emptyState();
  try {
    const parsed = JSON.parse(item.body) as SchedState;
    // 与默认规则合并，保证旧数据新字段存在
    return { ...emptyState(), ...parsed, rules: { ...emptyState().rules, ...parsed.rules } };
  } catch {
    return emptyState();
  }
}

export async function saveScheduleState(state: SchedState): Promise<void> {
  state.updatedAt = new Date().toISOString();
  const list = await getContents();
  const idx = list.findIndex((x) => x.id === SCHED_MAIN_ID && x.type === SCHED_TYPE);
  const item: ContentItem = {
    id: SCHED_MAIN_ID,
    type: SCHED_TYPE,
    title: "排课主数据",
    tag: "",
    summary: "",
    body: JSON.stringify(state),
    icon: "🗓️",
    tags: [],
    client: "",
    industry: "",
    result: "",
    at: new Date().toISOString().slice(0, 10),
    order: 1,
  };
  if (idx >= 0) list[idx] = item;
  else list.unshift(item);
  await saveContents(list);
}

/* ============== 模板 ============== */

export type TmplKind = "teachers" | "classes" | "subjects" | "rooms" | "oldsched";

export const TMPL_META: Record<TmplKind, { name: string; headers: string[]; example: string[]; note: string }> = {
  teachers: {
    name: "教师名册",
    headers: ["教师工号", "姓名", "可授科目", "周最大课时", "不排课节次"],
    example: ["T01", "张伟", "数学", "16", ""],
    note: "可授科目用逗号分隔；不排课节次格式：星期-节次，如 1-3 表示周一第3节，多个用逗号",
  },
  classes: {
    name: "班级名册",
    headers: ["班级ID", "班级名称", "学生人数"],
    example: ["C01", "高一(1)班", "48"],
    note: "班级ID 将作为课表主键，需唯一",
  },
  subjects: {
    name: "科目课时",
    headers: ["班级ID", "科目", "每周课时", "需实验室"],
    example: ["C01", "数学", "6", "否"],
    note: "需实验室填 是/否；决定该科目是否占用实验室",
  },
  rooms: {
    name: "教室名册",
    headers: ["教室ID", "教室名称", "容量", "类型"],
    example: ["R01", "101教室", "55", "普通"],
    note: "类型填 普通 或 实验室",
  },
  oldsched: {
    name: "旧课表（材料）",
    headers: ["班级ID", "星期", "节次", "科目", "教师工号", "教室ID"],
    example: ["C01", "1", "1", "数学", "T01", "R01"],
    note: "星期填 1-7（或 周一..周日）；节次填数字；导入后可在规则中开启「继承旧课表」",
  },
};

export function templateCsv(kind: TmplKind): string {
  const m = TMPL_META[kind];
  const header = "﻿" + m.headers.join(",");
  const row = m.example.join(",");
  return `${header}\n${row}\n`;
}

/* ============== 文件解析 ============== */

// 用 xlsx 读取（兼容 .xlsx/.xls/.csv），返回二维数组（含表头行）。
async function readSheetRows(buf: Buffer): Promise<string[][]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, blankrows: false, defval: "" });
  return rows.filter((r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim() !== ""));
}

function cellStr(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

/** 在表头行里找到候选列名对应的列索引 */
function colIndex(headers: string[], candidates: string[]): number {
  for (const c of candidates) {
    const i = headers.findIndex((h) => cellStr(h).includes(c));
    if (i >= 0) return i;
  }
  return -1;
}

function getCell(row: string[], idx: number): string {
  return idx >= 0 ? cellStr(row[idx]) : "";
}

function parseDay(raw: string): number {
  const s = cellStr(raw);
  if (/^\d+$/.test(s)) return Math.min(7, Math.max(1, parseInt(s, 10)));
  const cn = s.replace("星期", "").replace("周", "");
  const map: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
  return map[cn] || 1;
}

function parseUnavailable(raw: string): string[] {
  return cellStr(raw)
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/(\d+)\s*[-－]\s*(\d+)/);
      if (m) return `${m[1]}-${m[2]}`;
      return s;
    });
}

export async function parseImport(kind: TmplKind, buf: Buffer): Promise<unknown[]> {
  const rows = await readSheetRows(buf);
  if (rows.length < 2) throw new Error("文件没有数据行（仅表头）");
  const headers = rows[0].map((h) => cellStr(h));
  const dataRows = rows.slice(1);

  if (kind === "teachers") {
    const iId = colIndex(headers, ["教师工号", "工号", "id", "ID"]);
    const iName = colIndex(headers, ["姓名", "名称", "老师"]);
    const iSubj = colIndex(headers, ["可授科目", "科目"]);
    const iMax = colIndex(headers, ["周最大课时", "最大课时", "课时"]);
    const iUn = colIndex(headers, ["不排课", "不可用"]);
    return dataRows.map((r) => ({
      id: getCell(r, iId) || `T${Math.random().toString(36).slice(2, 7)}`,
      name: getCell(r, iName),
      subjects: getCell(r, iSubj).split(/[,，]/).map((s) => s.trim()).filter(Boolean),
      maxHours: Number(getCell(r, iMax)) || 0,
      unavailable: parseUnavailable(getCell(r, iUn)),
    }));
  }
  if (kind === "classes") {
    const iId = colIndex(headers, ["班级ID", "班级", "id", "ID"]);
    const iName = colIndex(headers, ["班级名称", "名称", "班级名"]);
    const iSize = colIndex(headers, ["学生人数", "人数", "人数"]);
    return dataRows.map((r) => ({
      id: getCell(r, iId) || `C${Math.random().toString(36).slice(2, 7)}`,
      name: getCell(r, iName),
      size: Number(getCell(r, iSize)) || 0,
    }));
  }
  if (kind === "subjects") {
    const iCid = colIndex(headers, ["班级ID", "班级", "id", "ID"]);
    const iSubj = colIndex(headers, ["科目", "课程"]);
    const iHours = colIndex(headers, ["每周课时", "课时", "节数"]);
    const iLab = colIndex(headers, ["需实验室", "实验室", "实验"]);
    return dataRows.map((r) => ({
      classId: getCell(r, iCid),
      subject: getCell(r, iSubj),
      hoursPerWeek: Number(getCell(r, iHours)) || 0,
      needLab: /是|yes|true|1/i.test(getCell(r, iLab)),
    }));
  }
  if (kind === "rooms") {
    const iId = colIndex(headers, ["教室ID", "教室", "id", "ID"]);
    const iName = colIndex(headers, ["教室名称", "名称"]);
    const iCap = colIndex(headers, ["容量", "座位数"]);
    const iType = colIndex(headers, ["类型", "类别"]);
    return dataRows.map((r) => ({
      id: getCell(r, iId) || `R${Math.random().toString(36).slice(2, 7)}`,
      name: getCell(r, iName),
      capacity: Number(getCell(r, iCap)) || 0,
      type: /实验|lab/i.test(getCell(r, iType)) ? ("实验室" as const) : ("普通" as const),
    }));
  }
  // oldsched
  const iCid = colIndex(headers, ["班级ID", "班级", "id", "ID"]);
  const iDay = colIndex(headers, ["星期", "周", "天"]);
  const iPer = colIndex(headers, ["节次", "节", "第几节"]);
  const iSubj = colIndex(headers, ["科目", "课程"]);
  const iTea = colIndex(headers, ["教师工号", "教师", "老师"]);
  const iRoom = colIndex(headers, ["教室ID", "教室"]);
  return dataRows.map((r) => ({
    classId: getCell(r, iCid),
    day: parseDay(getCell(r, iDay)),
    period: Number(getCell(r, iPer)) || 1,
    subject: getCell(r, iSubj),
    teacherId: getCell(r, iTea),
    roomId: getCell(r, iRoom),
  }));
}

/* ============== 半自动排课引擎 ============== */

export function detectConflicts(state: SchedState): Conflict[] {
  const { result, classes, rules } = state;
  if (!result) return [];
  const conflicts: Conflict[] = [];
  const classMap = new Map(classes.map((c) => [c.id, c.name]));
  for (let d = 0; d < rules.days; d++) {
    for (let p = 0; p < rules.periodsPerDay; p++) {
      const teacherSeen = new Map<string, string[]>();
      const roomSeen = new Map<string, string[]>();
      for (const cls of classes) {
        const grid = result.perClass[cls.id];
        const cell = grid?.[d]?.[p];
        if (!cell) continue;
        if (cell.teacherId) {
          const arr = teacherSeen.get(cell.teacherId) || [];
          arr.push(cls.id);
          teacherSeen.set(cell.teacherId, arr);
        }
        if (cell.roomId) {
          const arr = roomSeen.get(cell.roomId) || [];
          arr.push(cls.id);
          roomSeen.set(cell.roomId, arr);
        }
      }
      for (const [tid, cids] of teacherSeen) {
        if (cids.length > 1) {
          conflicts.push({
            type: "teacher",
            key: tid,
            day: d + 1,
            period: p + 1,
            classIds: cids,
            detail: `教师 ${tid} 在周${d + 1}第${p + 1}节被 ${cids.map((c) => classMap.get(c) || c).join("、")} 同时占用`,
          });
        }
      }
      for (const [rid, cids] of roomSeen) {
        if (cids.length > 1) {
          conflicts.push({
            type: "room",
            key: rid,
            day: d + 1,
            period: p + 1,
            classIds: cids,
            detail: `教室 ${rid} 在周${d + 1}第${p + 1}节被 ${cids.map((c) => classMap.get(c) || c).join("、")} 同时占用`,
          });
        }
      }
    }
  }
  return conflicts;
}

/** 半自动排课：继承旧课表 → 补足课时缺口 → 冲突检测（冲突保留供人工微调） */
export function generateSchedule(state: SchedState): SchedResult {
  const { classes, subjects, teachers, rooms, oldSchedule, rules } = state;
  const days = rules.days;
  const ppd = rules.periodsPerDay;

  // 初始化每班网格
  const perClass: Record<string, Cell[][]> = {};
  for (const c of classes) {
    perClass[c.id] = Array.from({ length: days }, () =>
      Array.from({ length: ppd }, () => null as Cell)
    );
  }

  // 1) 继承旧课表
  if (rules.inheritOld && oldSchedule.length) {
    for (const e of oldSchedule) {
      const grid = perClass[e.classId];
      if (grid && e.day >= 1 && e.day <= days && e.period >= 1 && e.period <= ppd) {
        grid[e.day - 1][e.period - 1] = {
          subject: e.subject,
          teacherId: e.teacherId,
          roomId: e.roomId,
        };
      }
    }
  }

  // 2) 计算缺口
  const required = new Map<string, number>(); // `${classId}|${subject}` -> 课时
  for (const s of subjects) {
    if (!s.classId || !s.subject || s.hoursPerWeek <= 0) continue;
    required.set(`${s.classId}|${s.subject}`, (required.get(`${s.classId}|${s.subject}`) || 0) + s.hoursPerWeek);
  }
  const placed = new Map<string, number>();
  for (const c of classes) {
    const grid = perClass[c.id];
    for (let d = 0; d < days; d++)
      for (let p = 0; p < ppd; p++) {
        const cell = grid[d][p];
        if (cell) placed.set(`${c.id}|${cell.subject}`, (placed.get(`${c.id}|${cell.subject}`) || 0) + 1);
      }
  }

  // 3) 为每班每科选择默认教师（优先旧课表中的教师）与教室
  const teacherBySubject = new Map<string, SchedTeacher>(); // subject -> teacher
  for (const t of teachers) for (const s of t.subjects) teacherBySubject.set(s, teacherBySubject.get(s) || t);

  const oldTeacherFor = new Map<string, string>(); // `${classId}|${subject}` -> teacherId
  for (const e of oldSchedule) oldTeacherFor.set(`${e.classId}|${e.subject}`, e.teacherId);

  const labRooms = rooms.filter((r) => r.type === "实验室");
  const normalRooms = rooms.filter((r) => r.type === "普通");

  function pickRoom(needLab: boolean, classSize: number): string {
    const pool = needLab ? labRooms : normalRooms.length ? normalRooms : rooms;
    const fit = pool.find((r) => r.capacity >= classSize) || pool[0];
    return fit?.id || "";
  }

  function teacherBusyAt(tid: string, d: number, p: number): boolean {
    for (const c of classes) {
      const cell = perClass[c.id]?.[d]?.[p];
      if (cell?.teacherId === tid) return true;
    }
    return false;
  }
  function roomBusyAt(rid: string, d: number, p: number): boolean {
    for (const c of classes) {
      const cell = perClass[c.id]?.[d]?.[p];
      if (cell?.roomId === rid) return true;
    }
    return false;
  }
  function isUnavailable(t: SchedTeacher, d: number, p: number): boolean {
    return t.unavailable.includes(`${d + 1}-${p + 1}`);
  }

  // 4) 逐科补课时
  for (const [key, need] of required) {
    const [classId, subject] = key.split("|");
    const cls = classes.find((c) => c.id === classId);
    const subjDef = subjects.find((s) => s.classId === classId && s.subject === subject);
    if (!cls || !subjDef) continue;
    let have = placed.get(key) || 0;
    const teacherId = oldTeacherFor.get(key) || teacherBySubject.get(subject)?.id || "";
    const teacher = teachers.find((t) => t.id === teacherId);
    const roomId = pickRoom(subjDef.needLab, cls.size);

    while (have < need) {
      // 找到该班第一个空闲格（教师、教室均空闲且不冲突）
      let placedThis = false;
      outer: for (let d = 0; d < days; d++) {
        for (let p = 0; p < ppd; p++) {
          if (perClass[classId][d][p]) continue;
          if (teacher && (teacherBusyAt(teacherId, d, p) || isUnavailable(teacher, d, p))) continue;
          if (roomId && roomBusyAt(roomId, d, p)) continue;
          perClass[classId][d][p] = { subject, teacherId, roomId };
          have++;
          placedThis = true;
          break outer;
        }
      }
      if (!placedThis) {
        // 实在排不下（无空闲/教师满），找一个仅本班空闲的格子兜底（冲突后续人工处理）
        for (let d = 0; d < days; d++)
          for (let p = 0; p < ppd; p++) {
            if (!perClass[classId][d][p]) {
              perClass[classId][d][p] = { subject, teacherId, roomId };
              have++;
              break;
            }
          }
      }
      if (have < need && !placedThis && perClass[classId].flat().filter(Boolean).length >= days * ppd) break; // 班级已满
    }
  }

  const conflicts = detectConflicts({ ...state, result: { perClass, conflicts: [], generatedAt: "", summary: "" } });

  // 汇总
  let totalReq = 0;
  let totalPlaced = 0;
  for (const [k, v] of required) {
    totalReq += v;
    totalPlaced += Math.min(v, placed.get(k) || 0);
  }
  const summary = `共 ${classes.length} 个班级、${required.size} 个(班×科目)排课单元；应排 ${totalReq} 节，已落位 ${totalPlaced} 节；检测到 ${conflicts.length} 处冲突（可在「班级/教师/教室」视图中拖拽微调后重新校验）。`;

  return {
    perClass,
    conflicts,
    generatedAt: new Date().toISOString(),
    summary,
  };
}

/* ============== 三视图派生 ============== */

export function buildTeacherView(state: SchedState): Record<string, Cell[][]> {
  const { result, teachers, rules } = state;
  if (!result) return {};
  const out: Record<string, Cell[][]> = {};
  for (const t of teachers) {
    const grid: Cell[][] = Array.from({ length: rules.days }, () =>
      Array.from({ length: rules.periodsPerDay }, () => null as Cell)
    );
    for (const cls of state.classes) {
      const cg = result.perClass[cls.id];
      if (!cg) continue;
      for (let d = 0; d < rules.days; d++)
        for (let p = 0; p < rules.periodsPerDay; p++) {
          const cell = cg[d][p];
          if (cell?.teacherId === t.id) grid[d][p] = { subject: cell.subject, teacherId: cls.id, roomId: cell.roomId };
        }
    }
    out[t.id] = grid;
  }
  return out;
}

export function buildRoomView(state: SchedState): Record<string, Cell[][]> {
  const { result, rooms, rules } = state;
  if (!result) return {};
  const out: Record<string, Cell[][]> = {};
  for (const r of rooms) {
    const grid: Cell[][] = Array.from({ length: rules.days }, () =>
      Array.from({ length: rules.periodsPerDay }, () => null as Cell)
    );
    for (const cls of state.classes) {
      const cg = result.perClass[cls.id];
      if (!cg) continue;
      for (let d = 0; d < rules.days; d++)
        for (let p = 0; p < rules.periodsPerDay; p++) {
          const cell = cg[d][p];
          if (cell?.roomId === r.id) grid[d][p] = { subject: cell.subject, teacherId: cls.id, roomId: cell.roomId };
        }
    }
    out[r.id] = grid;
  }
  return out;
}

/* ============== 只读分享快照 ============== */

export async function saveShareSnapshot(state: SchedState, title: string): Promise<string> {
  const token = newId("sh").replace(/[^a-zA-Z0-9]/g, "").slice(0, 16) || Math.random().toString(36).slice(2, 12);
  const list = await getContents();
  const item: ContentItem = {
    id: token,
    type: SCHED_SHARE_TYPE,
    title: title || "课表分享",
    tag: "",
    summary: "",
    body: JSON.stringify({ state, title, createdAt: new Date().toISOString() }),
    icon: "🔗",
    tags: [],
    client: "",
    industry: "",
    result: "",
    at: new Date().toISOString().slice(0, 10),
    order: 1,
  };
  list.unshift(item);
  await saveContents(list);
  return token;
}

export async function getShareSnapshot(token: string): Promise<SchedState | null> {
  const list = await getContents(SCHED_SHARE_TYPE);
  const item = list.find((x) => x.id === token);
  if (!item?.body) return null;
  try {
    return (JSON.parse(item.body) as { state: SchedState }).state;
  } catch {
    return null;
  }
}
