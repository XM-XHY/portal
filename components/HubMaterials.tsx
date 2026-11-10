"use client";

import { useCallback, useEffect, useState } from "react";

type MaterialRow = {
  id: string;
  title: string;
  question: string;
  engine?: string;
  at: string;
};

/** 知识中枢「我的材料」：服务端持久化的 AI 生成历史，换设备/刷新都不会丢 */
export default function HubMaterials({
  tick,
  onOpen,
}: {
  /** 每次生成成功后 +1，触发列表刷新 */
  tick: number;
  onOpen: (m: { title: string; content: string }) => void;
}) {
  const [items, setItems] = useState<MaterialRow[]>([]);
  const [err, setErr] = useState("");
  const [loadingId, setLoadingId] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/hub/materials", { cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "加载失败");
      setItems(Array.isArray(d.items) ? d.items : []);
      setErr("");
    } catch (e: any) {
      setErr(e.message || "加载失败");
    }
  }, []);

  useEffect(() => { load(); }, [load, tick]);

  async function open(row: MaterialRow) {
    setLoadingId(row.id);
    try {
      const r = await fetch(`/api/hub/materials?id=${encodeURIComponent(row.id)}`, { cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "读取失败");
      onOpen({ title: d.item.title, content: d.item.content });
    } catch (e: any) {
      setErr(e.message || "读取失败");
    } finally {
      setLoadingId("");
    }
  }

  async function remove(row: MaterialRow) {
    if (!confirm(`确定删除材料《${row.title}》？`)) return;
    const r = await fetch(`/api/hub/materials?id=${encodeURIComponent(row.id)}`, { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(d.error || "删除失败"); return; }
    await load();
  }

  return (
    <div className="mt-6 border-t border-white/10 pt-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-200">📝 我的材料（{items.length}）</h3>
        <button onClick={load} className="text-xs text-slate-400 hover:text-white">刷新</button>
      </div>
      <p className="mt-1 text-xs text-slate-500">AI 生成的材料自动保存，刷新或换设备登录后仍可查看。</p>
      {err && <p className="mt-2 text-xs text-red-400">{err}</p>}
      {items.length === 0 ? (
        <p className="mt-3 rounded-xl border border-white/10 p-3 text-xs text-slate-500">
          还没有生成记录。在右侧描述需求，生成后会自动出现在这里。
        </p>
      ) : (
        <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
          {items.map((m) => (
            <li key={m.id} className="flex items-center gap-2 rounded-xl border border-white/10 p-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-slate-200" title={m.title}>{m.title}</div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  {new Date(m.at).toLocaleString("zh-CN")} · {m.engine === "llm" ? "AI 起草" : m.engine === "kb" ? "知识库整理" : "模板"}
                </div>
              </div>
              <button onClick={() => open(m)} disabled={loadingId === m.id}
                className="rounded-lg border border-white/15 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/10 disabled:opacity-50">
                {loadingId === m.id ? "读取中" : "查看"}
              </button>
              <button onClick={() => remove(m)}
                className="rounded-lg border border-rose-400/30 px-2 py-1 text-[11px] text-rose-300 hover:bg-rose-500/10">
                删除
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
