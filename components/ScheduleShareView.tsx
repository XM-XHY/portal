"use client";

import { useMemo, useState } from "react";
import type { SchedState, Cell } from "@/lib/schedule";

const DAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

function conflictCells(state: SchedState) {
  const out = { classCells: new Map<string, Set<string>>(), teacherCells: new Map<string, Set<string>>(), roomCells: new Map<string, Set<string>>() };
  if (!state.result) return out;
  const perClass = state.result.perClass;
  const rules = state.rules;
  for (let d = 0; d < rules.days; d++)
    for (let p = 0; p < rules.periodsPerDay; p++) {
      const tSeen = new Map<string, string[]>(), rSeen = new Map<string, string[]>();
      for (const c of state.classes) {
        const cell = perClass[c.id]?.[d]?.[p];
        if (!cell) continue;
        if (cell.teacherId) (tSeen.get(cell.teacherId) || tSeen.set(cell.teacherId, []).get(cell.teacherId)!).push(c.id);
        if (cell.roomId) (rSeen.get(cell.roomId) || rSeen.set(cell.roomId, []).get(cell.roomId)!).push(c.id);
      }
      for (const [tid, cids] of tSeen) if (cids.length > 1) for (const cid of cids) {
        (out.classCells.get(cid) || out.classCells.set(cid, new Set()).get(cid)!).add(`${d}-${p}`);
        (out.teacherCells.get(tid) || out.teacherCells.set(tid, new Set()).get(tid)!).add(`${d}-${p}`);
      }
      for (const [rid, cids] of rSeen) if (cids.length > 1) for (const cid of cids) {
        (out.classCells.get(cid) || out.classCells.set(cid, new Set()).get(cid)!).add(`${d}-${p}`);
        (out.roomCells.get(rid) || out.roomCells.set(rid, new Set()).get(rid)!).add(`${d}-${p}`);
      }
    }
  return out;
}

function buildView(state: SchedState, mode: "teacher" | "room") {
  if (!state.result) return {} as Record<string, Cell[][]>;
  const grid: Record<string, Cell[][]> = {};
  const ids = mode === "teacher" ? state.teachers.map((t) => t.id) : state.rooms.map((r) => r.id);
  for (const id of ids) grid[id] = Array.from({ length: state.rules.days }, () => Array.from({ length: state.rules.periodsPerDay }, () => null as Cell));
  for (const c of state.classes) {
    const cg = state.result.perClass[c.id];
    if (!cg) continue;
    for (let d = 0; d < state.rules.days; d++)
      for (let p = 0; p < state.rules.periodsPerDay; p++) {
        const cell = cg[d][p];
        if (mode === "teacher" && cell?.teacherId && grid[cell.teacherId]) grid[cell.teacherId][d][p] = { subject: cell.subject, teacherId: c.id, roomId: cell.roomId };
        if (mode === "room" && cell?.roomId && grid[cell.roomId]) grid[cell.roomId][d][p] = { subject: cell.subject, teacherId: c.id, roomId: cell.roomId };
      }
  }
  return grid;
}

export default function ScheduleShareView({ state, token }: { state: SchedState; token: string }) {
  const [view, setView] = useState<"class" | "teacher" | "room">("class");
  const [activeClass, setActiveClass] = useState(state.classes[0]?.id || "");
  const [activeTeacher, setActiveTeacher] = useState(state.teachers[0]?.id || "");
  const [activeRoom, setActiveRoom] = useState(state.rooms[0]?.id || "");
  const conflicts = useMemo(() => conflictCells(state), [state]);
  const tn = useMemo(() => new Map(state.teachers.map((t) => [t.id, t.name])), [state]);
  const rn = useMemo(() => new Map(state.rooms.map((r) => [r.id, r.name])), [state]);
  const cn = useMemo(() => new Map(state.classes.map((c) => [c.id, c.name])), [state]);

  if (!state.result) return <p className="text-slate-500">该分享尚无课表。</p>;

  let grid: Cell[][] | undefined;
  let conflictSet: Set<string> | undefined;
  let selector: React.ReactNode = null;
  let labelFn: (cell: Cell) => { subject: string; sub: string } | null;

  if (view === "class") {
    grid = state.result.perClass[activeClass];
    conflictSet = conflicts.classCells.get(activeClass);
    selector = <select value={activeClass} onChange={(e) => setActiveClass(e.target.value)} className="input-base max-w-xs">{state.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>;
    labelFn = (cell) => cell ? { subject: cell.subject, sub: [cell.teacherId ? tn.get(cell.teacherId) || cell.teacherId : "", cell.roomId ? rn.get(cell.roomId) || cell.roomId : ""].filter(Boolean).join(" · ") } : null;
  } else if (view === "teacher") {
    const g = buildView(state, "teacher");
    grid = g[activeTeacher];
    conflictSet = conflicts.teacherCells.get(activeTeacher);
    selector = <select value={activeTeacher} onChange={(e) => setActiveTeacher(e.target.value)} className="input-base max-w-xs">{state.teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>;
    labelFn = (cell) => cell ? { subject: cell.subject, sub: [cell.teacherId ? cn.get(cell.teacherId) || cell.teacherId : "", cell.roomId ? rn.get(cell.roomId) || cell.roomId : ""].filter(Boolean).join(" · ") } : null;
  } else {
    const g = buildView(state, "room");
    grid = g[activeRoom];
    conflictSet = conflicts.roomCells.get(activeRoom);
    selector = <select value={activeRoom} onChange={(e) => setActiveRoom(e.target.value)} className="input-base max-w-xs">{state.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>;
    labelFn = (cell) => cell ? { subject: cell.subject, sub: [cell.teacherId ? cn.get(cell.teacherId) || cell.teacherId : "", cell.roomId ? tn.get(cell.roomId) || cell.roomId : ""].filter(Boolean).join(" · ") } : null;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {(["class", "teacher", "room"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)} className={`rounded-lg px-4 py-2 text-sm ${view === v ? "bg-brand-violet text-white" : "border border-white/20 text-slate-300"}`}>
            {v === "class" ? "🏫 班级课表" : v === "teacher" ? "👩‍🏫 教师课表" : "🚪 教室课表"}
          </button>
        ))}
        <span className="ml-auto flex gap-2">
          <button
            onClick={() => {
              window.location.href = `/api/schedule/export?token=${encodeURIComponent(token)}`;
            }}
            className="btn-ghost py-2 text-sm"
          >⬇ Excel</button>
          <button onClick={() => window.print()} className="btn-ghost py-2 text-sm">🖨️ 打印/PDF</button>
        </span>
      </div>
      {selector}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-center text-sm">
          <thead>
            <tr>
              <th className="border border-white/15 bg-slate-800 p-2 text-xs">节次＼星期</th>
              {Array.from({ length: state.rules.days }, (_, d) => <th key={d} className="border border-white/15 bg-slate-800 p-2 text-xs">{DAY_NAMES[d]}</th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: state.rules.periodsPerDay }, (_, p) => (
              <tr key={p}>
                <th className="border border-white/15 bg-slate-800 p-2 text-xs whitespace-nowrap">第{p + 1}节<br /><span className="text-slate-500">{state.rules.periodTimes[p] || ""}</span></th>
                {Array.from({ length: state.rules.days }, (_, d) => {
                  const cell = grid?.[d]?.[p] || null;
                  const lab = labelFn(cell);
                  const isC = conflictSet?.has(`${d}-${p}`);
                  return (
                    <td key={d} className={`border border-white/15 p-2 align-top text-left ${isC ? "bg-red-500/20 ring-1 ring-red-400" : cell ? "bg-white/5" : ""}`} style={{ minWidth: 120, height: 56 }}>
                      {lab ? <div><div className="font-medium text-slate-100">{lab.subject}</div>{lab.sub && <div className="text-[11px] text-slate-400">{lab.sub}</div>}</div> : <span className="text-slate-600">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {state.result.conflicts.length > 0 && (
        <p className="text-xs text-red-300">注：标红处为排课冲突（{state.result.conflicts.length} 处），仅供查看，请以学校最终确认为准。</p>
      )}
    </div>
  );
}
