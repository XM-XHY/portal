"use client";

import { useMemo, useRef, useState } from "react";
import {
  emptyState,
  generateSchedule,
  parseImport,
  templateCsv,
  buildScheduleWorkbook,
  TMPL_META,
  type SchedState,
  type Cell,
  type SchedRules,
  type TmplKind,
} from "@/lib/schedule-engine";
import {
  conflictCells,
  buildView,
  cellLabelClass,
  cellLabelView,
  GridTable,
  CellEditor,
} from "@/components/ScheduleGrid";
import PayGate from "@/components/PayGate";

const TMPL_KINDS: { kind: TmplKind; name: string }[] = [
  { kind: "teachers", name: "教师名册" },
  { kind: "classes", name: "班级名册" },
  { kind: "subjects", name: "科目课时" },
  { kind: "rooms", name: "教室名册" },
  { kind: "oldsched", name: "旧课表（材料）" },
];

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function SchedulePublic() {
  const [state, setState] = useState<SchedState>(() => emptyState());
  const [view, setView] = useState<"class" | "teacher" | "room">("class");
  const [activeClass, setActiveClass] = useState("");
  const [activeTeacher, setActiveTeacher] = useState("");
  const [activeRoom, setActiveRoom] = useState("");
  const [edit, setEdit] = useState<{ classId: string; d: number; p: number } | null>(null);
  const [drag, setDrag] = useState<{ d: number; p: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const conflicts = useMemo(() => conflictCells(state), [state]);
  const nameMaps = useMemo(
    () => ({
      tn: new Map(state.teachers.map((t) => [t.id, t.name])),
      rn: new Map(state.rooms.map((r) => [r.id, r.name])),
      cn: new Map(state.classes.map((c) => [c.id, c.name])),
    }),
    [state]
  );

  function mergeImport(kind: TmplKind, rows: unknown[]) {
    setState((s) => {
      const next: SchedState = { ...s };
      if (kind === "teachers") next.teachers = rows as SchedState["teachers"];
      else if (kind === "classes") next.classes = rows as SchedState["classes"];
      else if (kind === "subjects") next.subjects = rows as SchedState["subjects"];
      else if (kind === "rooms") next.rooms = rows as SchedState["rooms"];
      else next.oldSchedule = rows as SchedState["oldSchedule"];
      return next;
    });
  }

  async function importFile(kind: TmplKind, file: File) {
    setBusy(true);
    setErr("");
    try {
      const buf = await file.arrayBuffer();
      const rows = await parseImport(kind, buf);
      mergeImport(kind, rows);
      if (kind === "classes" && !activeClass) setActiveClass((rows as any[])[0]?.id || "");
      setErr("");
    } catch (e: any) {
      setErr(e.message || "导入失败");
    } finally {
      setBusy(false);
      const ref = fileRefs.current[kind];
      if (ref) ref.value = "";
    }
  }

  function downloadTemplate(kind: TmplKind) {
    const csv = templateCsv(kind);
    downloadBlob(new Blob(["﻿" + csv.replace(/^﻿/, "")], { type: "text/csv;charset=utf-8" }), `${TMPL_META[kind].name}.csv`);
  }

  function generate() {
    setBusy(true);
    setErr("");
    try {
      const result = generateSchedule(state);
      setState((s) => ({ ...s, result }));
    } catch (e: any) {
      setErr(e.message || "生成失败");
    } finally {
      setBusy(false);
    }
  }

  function updateRule(patch: Partial<SchedRules>) {
    setState((s) => {
      const rules = { ...s.rules, ...patch };
      if (patch.periodsPerDay && patch.periodsPerDay !== s.rules.periodsPerDay) {
        const n = patch.periodsPerDay;
        const old = s.rules.periodTimes;
        const times = Array.from({ length: n }, (_, i) => old[i] || defaultTime(i));
        rules.periodTimes = times;
      }
      return { ...s, rules };
    });
  }

  function swapWithinClass(classId: string, a: { d: number; p: number }, b: { d: number; p: number }) {
    if (!state.result) return;
    const grid = state.result.perClass[classId].map((row) => row.slice());
    const tmp = grid[a.d][a.p];
    grid[a.d][a.p] = grid[b.d][b.p];
    grid[b.d][b.p] = tmp;
    const perClass = { ...state.result.perClass, [classId]: grid };
    setState((s) => ({ ...s, result: { ...s.result!, perClass } }));
  }

  function updateCell(classId: string, d: number, p: number, cell: Cell) {
    if (!state.result) return;
    const grid = state.result.perClass[classId].map((row) => row.slice());
    grid[d][p] = cell;
    const perClass = { ...state.result.perClass, [classId]: grid };
    setState((s) => ({ ...s, result: { ...s.result!, perClass } }));
    setEdit(null);
  }

  async function exportExcel() {
    if (!state.result) return;
    // lib/schedule-engine 直接返回 xlsx 二进制（底层已由 xlsx 换成 exceljs），前端只负责下载
    const buf = await buildScheduleWorkbook(state);
    downloadBlob(
      new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      `课表_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  }

  const conflictCount = state.result?.conflicts.length || 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">
            智能 <span className="text-gradient">排课系统</span>
          </h1>
          <p className="mt-3 max-w-2xl text-slate-400">
            免费在线排课：导入名册与旧课表，一键自动排课、三视图校核、拖拽微调。导出 / 下载课表需支付少量费用。
          </p>
        </div>
        <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-sm text-emerald-300">免费使用 · 下载付费</span>
      </div>

      <div className="mt-8 space-y-6">
        {/* 导入 */}
        <div className="glass p-6">
          <h3 className="text-lg font-semibold text-white">① 导入数据（先下载模板，填好后上传）</h3>
          <p className="mt-1 text-xs text-slate-400">支持 .xlsx / .csv。旧课表为可选材料（导入后可在规则中开启「继承旧课表」）。</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TMPL_KINDS.map((t) => (
              <div key={t.kind} className="rounded-xl border border-white/10 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-200">{t.name}</span>
                  <button onClick={() => downloadTemplate(t.kind)} className="text-xs text-brand-cyan hover:underline">
                    下载模板
                  </button>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {t.kind === "teachers" && `已导入 ${state.teachers.length} 人`}
                  {t.kind === "classes" && `已导入 ${state.classes.length} 个`}
                  {t.kind === "subjects" && `已导入 ${state.subjects.length} 条`}
                  {t.kind === "rooms" && `已导入 ${state.rooms.length} 间`}
                  {t.kind === "oldsched" && `已导入 ${state.oldSchedule.length} 节`}
                </div>
                <input
                  ref={(el) => { fileRefs.current[t.kind] = el; }}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  disabled={busy}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(t.kind, f); }}
                  className="mt-2 block w-full cursor-pointer rounded-lg border border-white/15 bg-slate-900/80 px-2 py-1.5 text-xs text-slate-300 file:mr-2 file:cursor-pointer file:rounded file:border-0 file:bg-brand-blue/80 file:px-2 file:py-1 file:text-white"
                />
              </div>
            ))}
          </div>
        </div>

        {/* 规则 */}
        <div className="glass p-6">
          <h3 className="text-lg font-semibold text-white">② 排课规则</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block text-sm text-slate-400">
              每周天数
              <select value={state.rules.days} onChange={(e) => updateRule({ days: Number(e.target.value) })} className="input-base mt-1">
                {[5, 6, 7].map((d) => <option key={d} value={d}>{d} 天</option>)}
              </select>
            </label>
            <label className="block text-sm text-slate-400">
              每天节次
              <select value={state.rules.periodsPerDay} onChange={(e) => updateRule({ periodsPerDay: Number(e.target.value) })} className="input-base mt-1">
                {[6, 8, 10, 12].map((n) => <option key={n} value={n}>{n} 节</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 pt-6 text-sm text-slate-300">
              <input type="checkbox" checked={state.rules.inheritOld} onChange={(e) => updateRule({ inheritOld: e.target.checked })} className="h-4 w-4 accent-brand-violet" /> 继承旧课表
            </label>
            <label className="flex items-center gap-2 pt-6 text-sm text-slate-300">
              <input type="checkbox" checked={state.rules.connect} onChange={(e) => updateRule({ connect: e.target.checked })} className="h-4 w-4 accent-brand-violet" /> 允许连排
            </label>
          </div>
          <p className="mt-2 text-xs text-slate-500">节次时间将按每天节次数自动生成。规则即时生效。</p>
        </div>

        {/* 生成 + 结果 */}
        <div className="glass p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-white">③ 生成课表</h3>
              <p className="mt-1 text-xs text-slate-400">基于导入数据与规则，自动排课并检测冲突。</p>
            </div>
            <button onClick={generate} disabled={busy} className="btn-primary">{busy ? "生成中…" : "⚡ 一键排课"}</button>
          </div>

          {!state.result ? (
            <p className="mt-4 text-sm text-slate-500">尚未生成课表。导入班级与科目课时后点击「一键排课」。</p>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className={`rounded-full px-3 py-1 ${conflictCount ? "bg-red-500/20 text-red-300" : "bg-emerald-500/20 text-emerald-300"}`}>
                  {conflictCount ? `检测到 ${conflictCount} 处冲突` : "无冲突 ✓"}
                </span>
                <span className="text-slate-400">{state.result.summary}</span>
              </div>

              <div className="flex flex-wrap gap-2">
                {(["class", "teacher", "room"] as const).map((v) => (
                  <button key={v} onClick={() => setView(v)}
                    className={`rounded-lg px-4 py-2 text-sm ${view === v ? "bg-gradient-to-r from-brand-blue to-brand-violet text-white" : "border border-white/15 text-slate-300 hover:bg-white/10"}`}>
                    {v === "class" ? "🏫 班级课表" : v === "teacher" ? "👩‍🏫 教师课表" : "🚪 教室课表"}
                  </button>
                ))}
                <span className="ml-auto flex gap-2">
                  <PayGate productId="sched" label="⬇ Excel" className="btn-ghost py-2 text-sm" onGranted={exportExcel} />
                  <PayGate productId="sched" label="🖨️ PDF/打印" className="btn-ghost py-2 text-sm" onGranted={() => window.print()} />
                </span>
              </div>

              {view === "class" && (
                <>
                  <select value={activeClass} onChange={(e) => setActiveClass(e.target.value)} className="input-base max-w-xs">
                    {state.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <GridTable
                    state={state}
                    grid={state.result.perClass[activeClass]}
                    conflictSet={conflicts.classCells.get(activeClass)}
                    cellLabel={(cell) => cellLabelClass(cell, nameMaps)}
                    onEditCell={(d, p) => setEdit({ classId: activeClass, d, p })}
                    drag={drag} setDrag={setDrag}
                    onDropCell={(a, b) => swapWithinClass(activeClass, a, b)}
                    editable
                  />
                </>
              )}
              {view === "teacher" && (
                <>
                  <select value={activeTeacher} onChange={(e) => setActiveTeacher(e.target.value)} className="input-base max-w-xs">
                    {state.teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <GridTable
                    state={state}
                    grid={buildView(state, "teacher")[activeTeacher]}
                    conflictSet={conflicts.teacherCells.get(activeTeacher)}
                    cellLabel={(cell) => cellLabelView(cell, nameMaps, "teacher")}
                    onEditCell={() => {}} drag={null} setDrag={() => {}} onDropCell={() => {}} editable={false}
                  />
                </>
              )}
              {view === "room" && (
                <>
                  <select value={activeRoom} onChange={(e) => setActiveRoom(e.target.value)} className="input-base max-w-xs">
                    {state.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  <GridTable
                    state={state}
                    grid={buildView(state, "room")[activeRoom]}
                    conflictSet={conflicts.roomCells.get(activeRoom)}
                    cellLabel={(cell) => cellLabelView(cell, nameMaps, "room")}
                    onEditCell={() => {}} drag={null} setDrag={() => {}} onDropCell={() => {}} editable={false}
                  />
                </>
              )}

              {state.result.conflicts.length > 0 && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
                  <h4 className="text-sm font-semibold text-red-300">冲突清单（可在「班级」视图拖拽或点击单元格改派后重新校验）</h4>
                  <ul className="mt-2 space-y-1 text-xs text-slate-300">
                    {state.result.conflicts.slice(0, 30).map((c, i) => <li key={i}>· {c.detail}</li>)}
                    {state.result.conflicts.length > 30 && <li>…其余 {state.result.conflicts.length - 30} 处</li>}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {err && <p className="text-sm text-red-400">{err}</p>}
        <p className="text-xs text-slate-500">
          提示：本页排课在浏览器本地完成，不会自动上传。导出 Excel / 打印 PDF 会弹出收款二维码，支付后即可下载。
        </p>
        <p className="text-xs text-slate-500">
          还需要分班？
          <a href="/balance" className="ml-1 text-brand-cyan hover:underline">
            前往均衡分班系统 →
          </a>
        </p>
      </div>

      {edit && (
        <CellEditor
          state={state} classId={edit.classId} d={edit.d} p={edit.p}
          nameMaps={nameMaps} onClose={() => setEdit(null)}
          onSave={(cell) => updateCell(edit.classId, edit.d, edit.p, cell)}
        />
      )}
    </div>
  );
}

function defaultTime(i: number): string {
  const start = 8 * 60 + i * 55 + (i >= 4 ? 30 : 0);
  const h = Math.floor(start / 60), m = start % 60;
  const eh = Math.floor((start + 45) / 60), em = (start + 45) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}-${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}
