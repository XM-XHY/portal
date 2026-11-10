"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

type Hit = { title: string; name: string; className: string; duplicate?: string[] };

function QueryForm() {
  const sp = useSearchParams();
  const [code, setCode] = useState(sp.get("code") || "");
  const [name, setName] = useState("");
  const [hit, setHit] = useState<Hit | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function query() {
    setBusy(true);
    setErr("");
    setHit(null);
    try {
      const r = await fetch(
        `/api/balance/query?code=${encodeURIComponent(code.trim())}&name=${encodeURIComponent(name.trim())}`,
        { cache: "no-store" }
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "查询失败");
      setHit(d);
    } catch (e: any) {
      setErr(e.message || "查询失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="glass p-7">
        <h1 className="text-center text-2xl font-bold">
          分班结果 <span className="text-gradient">查询</span>
        </h1>
        <p className="mt-2 text-center text-xs text-slate-400">
          输入老师提供的查询码和学生姓名，查看所在班级
        </p>

        <div className="mt-6 space-y-4">
          <label className="block text-sm text-slate-400">
            查询码
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="如 ABC123"
              maxLength={10}
              className="input-base mt-1 font-mono text-lg tracking-widest uppercase"
            />
          </label>
          <label className="block text-sm text-slate-400">
            学生姓名
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="请输入完整姓名"
              maxLength={40}
              className="input-base mt-1"
            />
          </label>
          <button onClick={query} disabled={busy || !code || !name} className="btn-primary w-full disabled:opacity-50">
            {busy ? "查询中…" : "🔍 查询班级"}
          </button>
        </div>

        {err && (
          <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-center text-sm text-red-300">
            {err}
          </p>
        )}

        {hit && (
          <div className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-center">
            <p className="text-xs text-slate-400">{hit.title}</p>
            <p className="mt-2 text-sm text-slate-300">{hit.name} 同学</p>
            <p className="mt-1 text-3xl font-bold text-emerald-300">{hit.className}</p>
            {hit.duplicate && hit.duplicate.length > 1 && (
              <p className="mt-2 text-xs text-amber-300">
                注意：存在 {hit.duplicate.length} 个同名学生，分别分布在 {hit.duplicate.join("、")}，请联系老师确认。
              </p>
            )}
          </div>
        )}

        <p className="mt-6 text-center text-xs text-slate-500">
          找不到结果？请联系班主任确认查询码与姓名是否正确。
        </p>
      </div>
    </div>
  );
}

export default function BalanceQueryClient() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md px-4 py-12 text-center text-sm text-slate-400">加载中…</div>}>
      <QueryForm />
    </Suspense>
  );
}
