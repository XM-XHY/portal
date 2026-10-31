"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { SearchResponse } from "@/lib/search";
import { PROVIDER_LABEL } from "@/lib/search";

type Lead = { name: string; phone: string; company: string; query: string };

export default function ExploreClient() {
  const params = useSearchParams();
  const initial = params.get("q") || "";
  const [q, setQ] = useState(initial);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showLead, setShowLead] = useState(false);

  async function runSearch(keyword: string) {
    const kw = keyword.trim();
    if (!kw) return;
    setLoading(true);
    setError("");
    setData(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(kw)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "检索失败");
      setData(json);
    } catch (e: any) {
      setError(e.message || "检索失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initial) runSearch(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <Link href="/" className="text-sm text-slate-400 hover:text-white">
          ← 返回首页
        </Link>

        <h1 className="mt-4 text-3xl font-bold">
          智能 <span className="text-gradient">获客检索</span>
        </h1>
        <p className="mt-2 text-slate-400">
          输入业务关键词，即刻全网检索可信信息；结果均附原始来源与时间。
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            runSearch(q);
          }}
          className="glass mt-6 flex items-center gap-2 p-2"
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            type="search"
            placeholder="例如：AI 客服方案、企业知识库"
            aria-label="搜索关键词"
            className="flex-1 bg-transparent px-3 py-3 text-slate-100 placeholder:text-slate-500 outline-none"
          />
          <button type="submit" className="btn-primary shrink-0" disabled={loading}>
            {loading ? "检索中…" : "搜索"}
          </button>
        </form>

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {data && (
          <div className="mt-6">
            <div className="flex items-center justify-between text-sm text-slate-400">
              <span>
                关于 “<span className="text-white">{data.query}</span>” 共 {data.results.length} 条结果
              </span>
              <span>
                来源：{PROVIDER_LABEL[data.provider] ?? data.provider} ·{" "}
                {new Date(data.fetchedAt).toLocaleString("zh-CN")}
              </span>
            </div>
            {data.note && (
              <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-300">
                {data.note}
              </div>
            )}

            {data.summary && (
              <div className="mt-4 glass border-brand-cyan/30 p-5">
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-brand-cyan">
                  AI 摘要 · 基于下列真实来源
                </div>
                <p className="text-sm leading-relaxed text-slate-200">{data.summary}</p>
                {data.sources && data.sources.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {data.sources.map((s) => (
                      <a
                        key={s.n}
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-slate-300 transition hover:border-brand-cyan/50 hover:text-brand-cyan"
                        title={s.title}
                      >
                        [{s.n}] {s.title.length > 22 ? s.title.slice(0, 22) + "…" : s.title}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            <ul className="mt-4 space-y-3">
              {data.results.map((r, i) => (
                <li key={i} className="glass glass-hover p-5">
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-lg font-medium text-brand-cyan hover:underline">
                    {r.title}
                  </a>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">{r.snippet}</p>
                  <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
                    <span className="rounded-full border border-white/10 px-2 py-0.5">{r.source}</span>
                    {r.publishedAt && <span>📅 {r.publishedAt}</span>}
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="ml-auto text-brand-cyan hover:underline">
                      查看原文 ↗
                    </a>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-8 glass border-brand-violet/30 p-6 text-center">
              <p className="text-lg font-semibold text-white">
                找到所需方案？留下联系方式，获取定制落地建议
              </p>
              <button onClick={() => setShowLead(true)} className="btn-primary mt-4">
                免费获取方案
              </button>
            </div>
          </div>
        )}

        {!data && !loading && !error && (
          <div className="mt-10 text-center text-slate-500">
            输入关键词开始你的第一次智能检索 🚀
          </div>
        )}
      </div>

      {showLead && (
        <LeadModal query={q} onClose={() => setShowLead(false)} />
      )}
    </main>
  );
}

function LeadModal({ query, onClose }: { query: string; onClose: () => void }) {
  const [form, setForm] = useState<Lead>({ name: "", phone: "", company: "", query });
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "提交失败");
      }
      setDone(true);
    } catch (err: any) {
      alert(err.message || "提交失败，请稍后重试");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4 backdrop-blur"
      onClick={onClose}
    >
      <div
        className="glass w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <div className="text-center">
            <div className="text-3xl">✅</div>
            <p className="mt-3 font-semibold text-white">提交成功！</p>
            <p className="mt-1 text-sm text-slate-400">
              我们的顾问将尽快与您联系（演示数据已存本地）。
            </p>
            <button onClick={onClose} className="btn-primary mt-5">
              关闭
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <h3 className="text-lg font-semibold text-white">留下联系方式</h3>
            <p className="text-xs text-slate-400">关联关键词：{query || "—"}</p>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="您的称呼"
              className="input-base"
            />
            <input
              required
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="手机号"
              className="input-base"
            />
            <input
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
              placeholder="公司名称（选填）"
              className="input-base"
            />
            <div className="flex gap-2">
              <button type="submit" className="btn-primary flex-1">
                提交
              </button>
              <button type="button" onClick={onClose} className="btn-ghost">
                取消
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
