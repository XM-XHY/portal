"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SchedState, Cell, SchedRules } from "@/lib/schedule";

type TmplKind = "teachers" | "classes" | "subjects" | "rooms" | "oldsched";

function emptyState(): SchedState {
  const n = 8;
  const times = Array.from({ length: n }, (_, i) => {
    const start = 8 * 60 + i * 55 + (i >= 4 ? 30 : 0);
    const h = Math.floor(start / 60), m = start % 60;
    const eh = Math.floor((start + 45) / 60), em = (start + 45) % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}-${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
  });
  return {
    teachers: [], classes: [], subjects: [], rooms: [], oldSchedule: [],
    rules: { days: 5, periodsPerDay: 8, periodTimes: times, connect: true, sportSpread: true, inheritOld: true, sportSubjects: ["体育", "体育课", "体育与健康", "体锻"] },
    result: null, updatedAt: new Date().toISOString(),
  };
}

const DAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const TMPL_KINDS: { kind: TmplKind; name: string }[] = [
  { kind: "teachers", name: "教师名册" },
  { kind: "classes", name: "班级名册" },
  { kind: "subjects", name: "科目课时" },
  { kind: "rooms", name: "教室名册" },
  { kind: "oldsched", name: "旧课表（材料）" },
];

/* 纯前端冲突计算（与后端一致，仅用于高亮） */
function conflictCells(state: SchedState) {
  const out = { classCells: new Map<string, Set<string>>(), teacherCells: new Map<string, Set<string>>(), roomCells: new Map<string, Set<string>>() };
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
      for (const [tid, cids] of tSeen) if (cids.length > 1) for (const cid of cids) {
        const s = out.classCells.get(cid) || out.classCells.set(cid, new Set()).get(cid)!;
        s.add(`${d}-${p}`);
        const t = out.teacherCells.get(tid) || out.teacherCells.set(tid, new Set()).get(tid)!;
        t.add(`${d}-${p}`);
      }
      for (const [rid, cids] of rSeen) if (cids.length > 1) for (const cid of cids) {
        const s = out.classCells.get(cid) || out.classCells.set(cid, new Set()).get(cid)!;
        s.add(`${d}-${p}`);
        const r = out.roomCells.get(rid) || out.roomCells.set(rid, new Set()).get(rid)!;
        r.add(`${d}-${p}`);
      }
    }
  }
  return out;
}

function buildView(state: SchedState, mode: "teacher" | "room") {
  if (!state.result) return {} as Record<string, Cell[][]>;
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
        if (mode === "teacher" && cell?.teacherId && grid[cell.teacherId]) grid[cell.teacherId][d][p] = { subject: cell.subject, teacherId: c.id, roomId: cell.roomId };
        if (mode === "room" && cell?.roomId && grid[cell.roomId]) grid[cell.roomId][d][p] = { subject: cell.subject, teacherId: c.id, roomId: cell.roomId };
      }
  }
  return grid;
}

export default function ScheduleManager() {
  const [state, setState] = useState<SchedState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [view, setView] = useState<"class" | "teacher" | "room">("class");
  const [activeClass, setActiveClass] = useState("");
  const [activeTeacher, setActiveTeacher] = useState("");
  const [activeRoom, setActiveRoom] = useState("");
  const [edit, setEdit] = useState<{ classId: string; d: number; p: number } | null>(null);
  const [drag, setDrag] = useState<{ d: number; p: number } | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/schedule", { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "加载失败");
      const s = { ...emptyState(), ...d, rules: { ...emptyState().rules, ...d.rules } } as SchedState;
      setState(s);
      setActiveClass(s.classes[0]?.id || "");
      setActiveTeacher(s.teachers[0]?.id || "");
      setActiveRoom(s.rooms[0]?.id || "");
      setErr("");
    } catch (e: any) {
      setErr(e.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(""), 4000); };
  const nameMaps = useMemo(() => {
    if (!state) return { tn: new Map(), rn: new Map(), cn: new Map() };
    return {
      tn: new Map(state.teachers.map((t) => [t.id, t.name])),
      rn: new Map(state.rooms.map((r) => [r.id, r.name])),
      cn: new Map(state.classes.map((c) => [c.id, c.name])),
    };
  }, [state]);

  const conflicts = useMemo(() => (state ? conflictCells(state) : null), [state]);

  async function save(partial: Partial<SchedState>, note: string) {
    if (!state) return;
    setBusy(true);
    setErr("");
    try {
      const next: SchedState = { ...state, ...partial };
      if (next.result?.perClass) {
        // 本地重算冲突
        const cc = conflictCells(next);
        const cnt = [...cc.classCells.values()].reduce((a, s) => a + s.size, 0);
        next.result = { ...next.result, conflicts: (next.result.conflicts || []), summary: next.result.summary };
        void cnt;
      }
      const res = await fetch("/api/schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "保存失败");
      setState(next);
      flash(note);
    } catch (e: any) {
      setErr(e.message || "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function importFile(kind: TmplKind, file: File) {
    if (!state) return;
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      fd.append("kind", kind);
      fd.append("file", file);
      const res = await fetch("/api/schedule/import", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "导入失败");
      setState(d.state);
      // 同步选中项
      setActiveClass(d.state.classes[0]?.id || activeClass);
      flash(`${TMPL_KINDS.find((t) => t.kind === kind)?.name} 导入成功，共 ${d.count} 行`);
    } catch (e: any) {
      setErr(e.message || "导入失败");
    } finally {
      setBusy(false);
      const ref = fileRefs.current[kind]; if (ref) ref.value = "";
    }
  }

  async function generate() {
    if (!state) return;
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/schedule/generate", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "生成失败");
      setState({ ...state, result: d.result });
      flash(`已生成：${d.result.summary}`);
    } catch (e: any) {
      setErr(e.message || "生成失败");
    } finally {
      setBusy(false);
    }
  }

  async function createShare() {
    setBusy(true);
    try {
      const res = await fetch("/api/schedule/share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "课表分享" }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "分享失败");
      setShareUrl(d.url);
      flash("已生成只读分享链接");
    } catch (e: any) {
      setErr(e.message || "分享失败");
    } finally { setBusy(false); }
  }

  function updateRule(patch: Partial<SchedRules>) {
    if (!state) return;
    const rules = { ...state.rules, ...patch };
    if (patch.periodsPerDay && patch.periodsPerDay !== state.rules.periodsPerDay) {
      const n = patch.periodsPerDay;
      const old = state.rules.periodTimes;
      const times = Array.from({ length: n }, (_, i) => old[i] || defaultTime(i));
      rules.periodTimes = times;
    }
    save({ rules }, "规则已保存");
  }

  function swapWithinClass(classId: string, a: { d: number; p: number }, b: { d: number; p: number }) {
    if (!state?.result) return;
    const grid = state.result.perClass[classId].map((row) => row.slice());
    const tmp = grid[a.d][a.p];
    grid[a.d][a.p] = grid[b.d][b.p];
    grid[b.d][b.p] = tmp;
    const perClass = { ...state.result.perClass, [classId]: grid };
    save({ result: { ...state.result, perClass } }, "已调整课表位置");
  }

  function updateCell(classId: string, d: number, p: number, cell: Cell) {
    if (!state?.result) return;
    const grid = state.result.perClass[classId].map((row) => row.slice());
    grid[d][p] = cell;
    const perClass = { ...state.result.perClass, [classId]: grid };
    save({ result: { ...state.result, perClass } }, "已更新单元格");
    setEdit(null);
  }

  if (loading || !state) return <div className="text-slate-400">加载中…</div>;

  const conflictCount = state.result?.conflicts.length || 0;

  return (
    <div className="space-y-6">
      {/* 导入 */}
      <div className="glass p-6">
        <h3 className="text-lg font-semibold text-white">① 导入数据（按模板填好后上传）</h3>
        <p className="mt-1 text-xs text-slate-400">支持 .xlsx / .csv。先下载模板，按表头填写，再上传。旧课表为可选材料。</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TMPL_KINDS.map((t) => (
            <div key={t.kind} className="rounded-xl border border-white/10 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-200">{t.name}</span>
                <a href={`/api/schedule/template?kind=${t.kind}`} className="text-xs text-brand-cyan hover:underline">下载模板</a>
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
          <label className="block text-sm text-slate-400">每周天数
            <select value={state.rules.days} onChange={(e) => updateRule({ days: Number(e.target.value) })} className="input-base mt-1">
              {[5, 6, 7].map((d) => <option key={d} value={d}>{d} 天</option>)}
            </select>
          </label>
          <label className="block text-sm text-slate-400">每天节次
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
        <p className="mt-2 text-xs text-slate-500">节次时间将按每天节次数自动生成（可在导出后微调）。规则保存后自动生效。</p>
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
                <a href="/api/schedule/export" className="btn-ghost py-2 text-sm">⬇ Excel</a>
                <button onClick={() => window.print()} className="btn-ghost py-2 text-sm">🖨️ PDF/打印</button>
                <button onClick={createShare} disabled={busy} className="btn-ghost py-2 text-sm">🔗 分享链接</button>
              </span>
            </div>

            {shareUrl && (
              <div className="rounded-lg border border-brand-cyan/30 bg-brand-cyan/5 p-3 text-sm">
                <span className="text-slate-300">只读分享链接（免登录）：</span>
                <a href={shareUrl} className="ml-2 text-brand-cyan hover:underline break-all">{shareUrl}</a>
                <button onClick={() => navigator.clipboard?.writeText(shareUrl)} className="ml-2 text-xs text-slate-400 hover:text-white">复制</button>
              </div>
            )}

            <ScheduleGrid
              state={state}
              view={view}
              activeClass={activeClass}
              setActiveClass={setActiveClass}
              activeTeacher={activeTeacher}
              setActiveTeacher={setActiveTeacher}
              activeRoom={activeRoom}
              setActiveRoom={setActiveRoom}
              conflicts={conflicts!}
              nameMaps={nameMaps}
              onEditCell={setEdit}
              drag={drag}
              setDrag={setDrag}
              onSwap={swapWithinClass}
            />

            {state.result.conflicts.length > 0 && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
                <h4 className="text-sm font-semibold text-red-300">冲突清单（可在上方班级视图拖拽或点击单元格改派后重新校验）</h4>
                <ul className="mt-2 space-y-1 text-xs text-slate-300">
                  {state.result.conflicts.slice(0, 30).map((c, i) => (
                    <li key={i}>· {c.detail}</li>
                  ))}
                  {state.result.conflicts.length > 30 && <li>…其余 {state.result.conflicts.length - 30} 处</li>}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {msg && <p className="text-sm text-emerald-400">{msg}</p>}
      {err && <p className="text-sm text-red-400">{err}</p>}

      {edit && state && (
        <CellEditor
          state={state}
          classId={edit.classId}
          d={edit.d}
          p={edit.p}
          nameMaps={nameMaps}
          onClose={() => setEdit(null)}
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

/* ---------------- 课表网格 ---------------- */
function ScheduleGrid(props: {
  state: SchedState; view: "class" | "teacher" | "room";
  activeClass: string; setActiveClass: (v: string) => void;
  activeTeacher: string; setActiveTeacher: (v: string) => void;
  activeRoom: string; setActiveRoom: (v: string) => void;
  conflicts: ReturnType<typeof conflictCells>;
  nameMaps: { tn: Map<string, string>; rn: Map<string, string>; cn: Map<string, string> };
  onEditCell: (e: { classId: string; d: number; p: number }) => void;
  drag: { d: number; p: number } | null; setDrag: (v: { d: number; p: number } | null) => void;
  onSwap: (classId: string, a: { d: number; p: number }, b: { d: number; p: number }) => void;
}) {
  const { state, view } = props;
  if (view === "class") {
    if (!props.activeClass) return <p className="text-slate-500">请先在「班级名册」导入班级。</p>;
    const grid = state.result!.perClass[props.activeClass];
    return (
      <>
        <select value={props.activeClass} onChange={(e) => props.setActiveClass(e.target.value)} className="input-base max-w-xs">
          {state.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <GridTable
          state={state} grid={grid} conflictSet={props.conflicts.classCells.get(props.activeClass)}
          cellLabel={(cell) => cellLabelClass(cell, props.nameMaps)}
          onEditCell={(d, p) => props.onEditCell({ classId: props.activeClass, d, p })}
          drag={props.drag} setDrag={props.setDrag}
          onDropCell={(a, b) => props.onSwap(props.activeClass, a, b)}
          editable
        />
      </>
    );
  }
  if (view === "teacher") {
    const grid = buildView(state, "teacher");
    const id = props.activeTeacher;
    if (!id) return <p className="text-slate-500">请先导入教师名册。</p>;
    return (
      <>
        <select value={id} onChange={(e) => props.setActiveTeacher(e.target.value)} className="input-base max-w-xs">
          {state.teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <GridTable state={state} grid={grid[id]} conflictSet={props.conflicts.teacherCells.get(id)}
          cellLabel={(cell) => cellLabelView(cell, props.nameMaps, "teacher")} onEditCell={() => {}} drag={null} setDrag={() => {}} onDropCell={() => {}} editable={false} />
      </>
    );
  }
  const grid = buildView(state, "room");
  const id = props.activeRoom;
  if (!id) return <p className="text-slate-500">请先导入教室名册。</p>;
  return (
    <>
      <select value={id} onChange={(e) => props.setActiveRoom(e.target.value)} className="input-base max-w-xs">
        {state.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
      <GridTable state={state} grid={grid[id]} conflictSet={props.conflicts.roomCells.get(id)}
        cellLabel={(cell) => cellLabelView(cell, props.nameMaps, "room")} onEditCell={() => {}} drag={null} setDrag={() => {}} onDropCell={() => {}} editable={false} />
    </>
  );
}

function cellLabelClass(cell: Cell, nm: { tn: Map<string, string>; rn: Map<string, string>; cn: Map<string, string> }) {
  if (!cell) return null;
  const t = cell.teacherId ? nm.tn.get(cell.teacherId) || cell.teacherId : "";
  const r = cell.roomId ? nm.rn.get(cell.roomId) || cell.roomId : "";
  return { subject: cell.subject, sub: [t, r].filter(Boolean).join(" · ") };
}
function cellLabelView(cell: Cell, nm: { tn: Map<string, string>; rn: Map<string, string>; cn: Map<string, string> }, mode: "teacher" | "room") {
  if (!cell) return null;
  const c = cell.teacherId ? nm.cn.get(cell.teacherId) || cell.teacherId : "";
  const other = mode === "teacher" ? (cell.roomId ? nm.rn.get(cell.roomId) || cell.roomId : "") : (cell.roomId ? nm.tn.get(cell.roomId) || cell.roomId : "");
  return { subject: cell.subject, sub: [c, other].filter(Boolean).join(" · ") };
}

function GridTable(props: {
  state: SchedState; grid: Cell[][] | undefined; conflictSet?: Set<string>;
  cellLabel: (cell: Cell) => { subject: string; sub: string } | null;
  onEditCell: (d: number, p: number) => void;
  drag: { d: number; p: number } | null; setDrag: (v: { d: number; p: number } | null) => void;
  onDropCell: (a: { d: number; p: number }, b: { d: number; p: number }) => void; editable: boolean;
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
              <th key={d} className="border border-white/10 bg-slate-800 p-2 text-xs text-slate-200">{DAY_NAMES[d]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: state.rules.periodsPerDay }, (_, p) => (
            <tr key={p}>
              <th className="border border-white/10 bg-slate-800 p-2 text-xs text-slate-300 whitespace-nowrap">
                第{p + 1}节<br /><span className="text-slate-500">{state.rules.periodTimes[p] || ""}</span>
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
                    onDrop={(e) => { e.preventDefault(); if (props.editable && props.drag) props.onDropCell(props.drag, { d, p }); props.setDrag(null); }}
                    className={`border border-white/10 p-2 align-top text-left transition ${isConflict ? "bg-red-500/20 ring-1 ring-red-400" : cell ? "bg-white/5" : ""} ${props.editable ? "cursor-pointer hover:bg-brand-cyan/10" : ""} ${isDrag ? "opacity-40" : ""}`}
                    style={{ minWidth: 120, height: 56 }}
                  >
                    {lab ? (
                      <div>
                        <div className="font-medium text-slate-100">{lab.subject}</div>
                        {lab.sub && <div className="text-[11px] text-slate-400">{lab.sub}</div>}
                      </div>
                    ) : <span className="text-slate-600">—</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {props.editable && <p className="mt-2 text-xs text-slate-500">点击有内容的单元格可改派科目/教师/教室；按住拖动可交换两格位置。</p>}
    </div>
  );
}

/* ---------------- 单元格编辑器 ---------------- */
function CellEditor(props: {
  state: SchedState; classId: string; d: number; p: number;
  nameMaps: { tn: Map<string, string>; rn: Map<string, string>; cn: Map<string, string> };
  onClose: () => void; onSave: (cell: Cell) => void;
}) {
  const { state, classId, d, p } = props;
  const current = state.result!.perClass[classId][d][p];
  const classSubjects = Array.from(new Set(state.subjects.filter((s) => s.classId === classId).map((s) => s.subject)));
  const [subject, setSubject] = useState(current?.subject || classSubjects[0] || "");
  const teacherPool = state.teachers.filter((t) => t.subjects.includes(subject));
  const [teacherId, setTeacherId] = useState(current?.teacherId || teacherPool[0]?.id || "");
  const [roomId, setRoomId] = useState(current?.roomId || "");

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={props.onClose}>
      <div className="glass w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-white">编辑单元格（周{DAY_NAMES[d]} 第{p + 1}节）</h3>
        <div className="mt-4 space-y-3">
          <label className="block text-sm text-slate-400">科目
            <select value={subject} onChange={(e) => { setSubject(e.target.value); const tp = state.teachers.filter((t) => t.subjects.includes(e.target.value)); setTeacherId(tp[0]?.id || ""); }} className="input-base mt-1">
              {classSubjects.map((s) => <option key={s} value={s}>{s}</option>)}
              {!classSubjects.includes(subject) && subject && <option value={subject}>{subject}</option>}
            </select>
          </label>
          <label className="block text-sm text-slate-400">教师
            <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className="input-base mt-1">
              <option value="">（未分配）</option>
              {teacherPool.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className="block text-sm text-slate-400">教室
            <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className="input-base mt-1">
              <option value="">（未分配）</option>
              {state.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-5 flex gap-2">
          <button onClick={() => props.onSave(subject ? { subject, teacherId, roomId } : null)} className="btn-primary">保存</button>
          <button onClick={() => props.onSave(null)} className="btn-ghost">清空</button>
          <button onClick={props.onClose} className="btn-ghost ml-auto">取消</button>
        </div>
      </div>
    </div>
  );
}
