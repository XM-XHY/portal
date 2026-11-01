"use client";

// 排课课表【纯展示组件】—— 不含任何服务端依赖，ScheduleManager 与公开排课工具共用。
import { useState } from "react";
import type { SchedState, Cell } from "@/lib/schedule-engine";

export const DAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export type ConflictMaps = {
  classCells: Map<string, Set<string>>;
  teacherCells: Map<string, Set<string>>;
  roomCells: Map<string, Set<string>>;
};

/** 前端冲突高亮计算（与后端一致） */
export function conflictCells(state: SchedState): ConflictMaps {
  const out: ConflictMaps = {
    classCells: new Map(),
    teacherCells: new Map(),
    roomCells: new Map(),
  };
  if (!state.result) return out;
  const perClass = state.result.perClass;
  const rules = state.rules;
  for (let d = 0; d < rules.days; d++) {
    for (let p = 0; p < rules.periodsPerDay; p++) {
      const tSeen = new Map<string, string[]>();
      const rSeen = new Map<string, string[]>();
      for (const c of state.classes) {
        const cell = perClass[c.id]?.[d]?.[p];
        if (!cell) continue;
        if (cell.teacherId) (tSeen.get(cell.teacherId) || tSeen.set(cell.teacherId, []).get(cell.teacherId)!).push(c.id);
        if (cell.roomId) (rSeen.get(cell.roomId) || rSeen.set(cell.roomId, []).get(cell.roomId)!).push(c.id);
      }
      for (const [tid, cids] of tSeen)
        if (cids.length > 1)
          for (const cid of cids) {
            const s = out.classCells.get(cid) || out.classCells.set(cid, new Set()).get(cid)!;
            s.add(`${d}-${p}`);
            const t = out.teacherCells.get(tid) || out.teacherCells.set(tid, new Set()).get(tid)!;
            t.add(`${d}-${p}`);
          }
      for (const [rid, cids] of rSeen)
        if (cids.length > 1)
          for (const cid of cids) {
            const s = out.classCells.get(cid) || out.classCells.set(cid, new Set()).get(cid)!;
            s.add(`${d}-${p}`);
            const r = out.roomCells.get(rid) || out.roomCells.set(rid, new Set()).get(rid)!;
            r.add(`${d}-${p}`);
          }
    }
  }
  return out;
}

export function buildView(state: SchedState, mode: "teacher" | "room"): Record<string, Cell[][]> {
  if (!state.result) return {};
  const grid: Record<string, Cell[][]> = {};
  const ids = mode === "teacher" ? state.teachers.map((t) => t.id) : state.rooms.map((r) => r.id);
  for (const id of ids) {
    grid[id] = Array.from({ length: state.rules.days }, () =>
      Array.from({ length: state.rules.periodsPerDay }, () => null as Cell)
    );
  }
  for (const c of state.classes) {
    const cg = state.result.perClass[c.id];
    if (!cg) continue;
    for (let d = 0; d < state.rules.days; d++)
      for (let p = 0; p < state.rules.periodsPerDay; p++) {
        const cell = cg[d][p];
        if (mode === "teacher" && cell?.teacherId && grid[cell.teacherId])
          grid[cell.teacherId][d][p] = { subject: cell.subject, teacherId: c.id, roomId: cell.roomId };
        if (mode === "room" && cell?.roomId && grid[cell.roomId])
          grid[cell.roomId][d][p] = { subject: cell.subject, teacherId: c.id, roomId: cell.roomId };
      }
  }
  return grid;
}

export function cellLabelClass(
  cell: Cell,
  nm: { tn: Map<string, string>; rn: Map<string, string>; cn: Map<string, string> }
) {
  if (!cell) return null;
  const t = cell.teacherId ? nm.tn.get(cell.teacherId) || cell.teacherId : "";
  const r = cell.roomId ? nm.rn.get(cell.roomId) || cell.roomId : "";
  return { subject: cell.subject, sub: [t, r].filter(Boolean).join(" · ") };
}
export function cellLabelView(
  cell: Cell,
  nm: { tn: Map<string, string>; rn: Map<string, string>; cn: Map<string, string> },
  mode: "teacher" | "room"
) {
  if (!cell) return null;
  const c = cell.teacherId ? nm.cn.get(cell.teacherId) || cell.teacherId : "";
  const other =
    mode === "teacher"
      ? cell.roomId
        ? nm.rn.get(cell.roomId) || cell.roomId
        : ""
      : cell.roomId
        ? nm.tn.get(cell.roomId) || cell.roomId
        : "";
  return { subject: cell.subject, sub: [c, other].filter(Boolean).join(" · ") };
}

export function GridTable(props: {
  state: SchedState;
  grid: Cell[][] | undefined;
  conflictSet?: Set<string>;
  cellLabel: (cell: Cell) => { subject: string; sub: string } | null;
  onEditCell: (d: number, p: number) => void;
  drag: { d: number; p: number } | null;
  setDrag: (v: { d: number; p: number } | null) => void;
  onDropCell: (a: { d: number; p: number }, b: { d: number; p: number }) => void;
  editable: boolean;
}) {
  const { state, grid, conflictSet } = props;
  if (!grid) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-center text-sm print:w-full">
        <thead>
          <tr>
            <th className="border border-white/10 bg-slate-800 p-2 text-xs text-slate-300">节次＼星期</th>
            {Array.from({ length: state.rules.days }, (_, d) => (
              <th key={d} className="border border-white/10 bg-slate-800 p-2 text-xs text-slate-200">
                {DAY_NAMES[d]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: state.rules.periodsPerDay }, (_, p) => (
            <tr key={p}>
              <th className="border border-white/10 bg-slate-800 p-2 text-xs text-slate-300 whitespace-nowrap">
                第{p + 1}节<br />
                <span className="text-slate-500">{state.rules.periodTimes[p] || ""}</span>
              </th>
              {Array.from({ length: state.rules.days }, (_, d) => {
                const cell = grid[d]?.[p] || null;
                const lab = props.cellLabel(cell);
                const isConflict = conflictSet?.has(`${d}-${p}`);
                const isDrag = props.drag && props.drag.d === d && props.drag.p === p;
                return (
                  <td
                    key={d}
                    onClick={() => props.editable && lab && props.onEditCell(d, p)}
                    draggable={props.editable}
                    onDragStart={() => props.editable && props.setDrag({ d, p })}
                    onDragOver={(e) => props.editable && e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (props.editable && props.drag) props.onDropCell(props.drag, { d, p });
                      props.setDrag(null);
                    }}
                    className={`border border-white/10 p-2 align-top text-left transition ${
                      isConflict ? "bg-red-500/20 ring-1 ring-red-400" : cell ? "bg-white/5" : ""
                    } ${props.editable ? "cursor-pointer hover:bg-brand-cyan/10" : ""} ${isDrag ? "opacity-40" : ""}`}
                    style={{ minWidth: 120, height: 56 }}
                  >
                    {lab ? (
                      <div>
                        <div className="font-medium text-slate-100">{lab.subject}</div>
                        {lab.sub && <div className="text-[11px] text-slate-400">{lab.sub}</div>}
                      </div>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {props.editable && (
        <p className="mt-2 text-xs text-slate-500">
          点击有内容的单元格可改派科目/教师/教室；按住拖动可交换两格位置。
        </p>
      )}
    </div>
  );
}

export function CellEditor(props: {
  state: SchedState;
  classId: string;
  d: number;
  p: number;
  nameMaps: { tn: Map<string, string>; rn: Map<string, string>; cn: Map<string, string> };
  onClose: () => void;
  onSave: (cell: Cell) => void;
}) {
  const { state, classId, d, p } = props;
  const current = state.result!.perClass[classId][d][p];
  const classSubjects = Array.from(
    new Set(state.subjects.filter((s) => s.classId === classId).map((s) => s.subject))
  );
  const [subject, setSubject] = useState(current?.subject || classSubjects[0] || "");
  const teacherPool = state.teachers.filter((t) => t.subjects.includes(subject));
  const [teacherId, setTeacherId] = useState(current?.teacherId || teacherPool[0]?.id || "");
  const [roomId, setRoomId] = useState(current?.roomId || "");

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={props.onClose}>
      <div className="glass w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-white">
          编辑单元格（{DAY_NAMES[d]} 第{p + 1}节）
        </h3>
        <div className="mt-4 space-y-3">
          <label className="block text-sm text-slate-400">
            科目
            <select
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                const tp = state.teachers.filter((t) => t.subjects.includes(e.target.value));
                setTeacherId(tp[0]?.id || "");
              }}
              className="input-base mt-1"
            >
              {classSubjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              {!classSubjects.includes(subject) && subject && <option value={subject}>{subject}</option>}
            </select>
          </label>
          <label className="block text-sm text-slate-400">
            教师
            <select
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
              className="input-base mt-1"
            >
              <option value="">（未分配）</option>
              {teacherPool.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-slate-400">
            教室
            <select
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="input-base mt-1"
            >
              <option value="">（未分配）</option>
              {state.rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-5 flex gap-2">
          <button
            onClick={() => props.onSave(subject ? { subject, teacherId, roomId } : null)}
            className="btn-primary"
          >
            保存
          </button>
          <button onClick={() => props.onSave(null)} className="btn-ghost">
            清空
          </button>
          <button onClick={props.onClose} className="btn-ghost ml-auto">
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

export function defaultTime(i: number): string {
  const start = 8 * 60 + i * 55 + (i >= 4 ? 30 : 0);
  const h = Math.floor(start / 60),
    m = start % 60;
  const eh = Math.floor((start + 45) / 60),
    em = (start + 45) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}-${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}
