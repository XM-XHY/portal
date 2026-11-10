"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { SearchResponse } from "@/lib/search";
import { PROVIDER_LABEL } from "@/lib/search";

type Lead = { name: string; phone: string; company: string; query: string };
type WatchItem = { title: string; url: string; source: string };

const INDUSTRIES = ["不限", "金融", "制造", "零售", "医疗", "教育", "政企", "互联网"];
const INFO_TYPES = ["不限", "政策法规", "行业报告", "案例实践", "供应商", "价格对比"];

const SCENES = [
  { icon: "🔍", label: "查行业政策", hint: "人工智能 数据安全 政策法规" },
  { icon: "🏭", label: "找供应商渠道", hint: "智能客服系统 供应商 报价" },
  { icon: "📊", label: "看竞品动态", hint: "企业知识库 产品对比 最新" },
  { icon: "🎯", label: "挖潜在客户", hint: "数字化转型 需求 采购" },
];

const HISTORY_KEY = "explore_history_v1";
const WATCH_KEY = "explore_watchlist_v1";

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function ExploreClient() {
  const params = useSearchParams();
  const initial = params.get("q") || "";
  const [q, setQ] = useState(initial);
  const [industry, setIndustry] = useState("不限");
  const [infoType, setInfoType] = useState("不限");
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showLead, setShowLead] = useState(false);
  const [leadTitle, setLeadTitle] = useState(""); // 来自单条结果的关注上下文
  const [history, setHistory] = useState<string[]>([]);
  const [watchlist, setWatchlist] = useState<WatchItem[]>([]);
  const [showWatch, setShowWatch] = useState(false);

  // 初始化本地数据
  useEffect(() => {
    setHistory(loadJSON<string[]>(HISTORY_KEY, []));
    setWatchlist(loadJSON<WatchItem[]>(WATCH_KEY, []));
  }, []);

  function rememberHistory(kw: string) {
    setHistory((prev) => {
      const next = [kw, ...prev.filter((x) => x !== kw)].slice(0, 6);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  /** 组装精准查询词：关键词 + 行业 + 信息类型 */
  const buildQuery = (kw: string) => {
    const parts = [kw.trim()];
    if (industry !== "不限") parts.push(industry);
    if (infoType !== "不限") parts.push(infoType);
    parts.push("最新");
    return parts.filter(Boolean).join(" ");
  };

  async function runSearch(keyword: string) {
    const kw = keyword.trim();
    if (!kw) return;
    setLoading(true);
    setError("");
    setData(null);
    rememberHistory(kw);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(buildQuery(kw))}`);
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

  function toggleWatch(r: WatchItem) {
    setWatchlist((prev) => {
      const exists = prev.some((x) => x.url === r.url);
      const next = exists ? prev.filter((x) => x.url !== r.url) : [r, ...prev].slice(0, 10);
      try { localStorage.setItem(WATCH_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }
  const isWatched = (url: string) => watchlist.some((x) => x.url === url);

  function openLead(title = "") {
    // 检索降级为示例数据时禁止留资：这些条目是假数据，不能作为真实商机入库
    if (data?.provider === "mock") return;
    setLeadTitle(title);
    setShowLead(true);
  }

  const watchedCount = watchlist.length;
  const isMock = data?.provider === "mock";
  const queryEcho = useMemo(() => (data ? data.query : ""), [data]);

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm text-slate-400 hover:text-white">← 返回首页</Link>
          <button
            onClick={() => setShowWatch(true)}
            className="relative rounded-full border border-white/15 px-3 py-1.5 text-xs text-slate-300 transition hover:border-brand-cyan/50 hover:text-brand-cyan"
          >
            ⭐ 我的关注清单{watchedCount > 0 && ` (${watchedCount})`}
          </button>
        </div>

        <h1 className="mt-4 text-3xl font-bold">
          智能 <span className="text-gradient">获客工作台</span>
        </h1>
        <p className="mt-2 text-slate-400">
          关键词 + 行业 + 信息类型三重精准定位，全网实时检索可信信息；关注感兴趣的结果，一键交由顾问深挖。
        </p>

        {/* 场景快捷入口 */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SCENES.map((s) => (
            <button
              key={s.label}
              onClick={() => { setQ(s.hint); runSearch(s.hint); }}
              className="glass glass-hover p-3 text-left text-sm"
            >
              <div className="text-xl">{s.icon}</div>
              <div className="mt-1.5 font-medium text-white">{s.label}</div>
              <div className="mt-0.5 truncate text-xs text-slate-500">{s.hint}</div>
            </button>
          ))}
        </div>

        {/* 搜索表单 */}
        <form
          onSubmit={(e) => { e.preventDefault(); runSearch(q); }}
          className="glass mt-4 space-y-3 p-3"
        >
          <div className="flex items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              type="search"
              placeholder="输入业务关键词，例如：智能客服、数据中台"
              aria-label="搜索关键词"
              className="flex-1 bg-transparent px-3 py-3 text-slate-100 placeholder:text-slate-500 outline-none"
            />
            <button type="submit" className="btn-primary shrink-0" disabled={loading}>
              {loading ? "检索中…" : "精准搜索"}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 px-1 text-xs">
            <span className="text-slate-500">行业</span>
            {INDUSTRIES.map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => setIndustry(x)}
                className={`rounded-full px-2.5 py-1 transition ${industry === x ? "bg-brand-blue/90 text-white" : "border border-white/10 text-slate-400 hover:text-white"}`}
              >
                {x}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 px-1 text-xs">
            <span className="text-slate-500">类型</span>
            {INFO_TYPES.map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => setInfoType(x)}
                className={`rounded-full px-2.5 py-1 transition ${infoType === x ? "bg-brand-violet/90 text-white" : "border border-white/10 text-slate-400 hover:text-white"}`}
              >
                {x}
              </button>
            ))}
          </div>
        </form>

        {/* 搜索历史 */}
        {history.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500">最近搜索：</span>
            {history.map((h) => (
              <button
                key={h}
                onClick={() => { setQ(h); runSearch(h); }}
                className="rounded-full border border-white/10 px-2.5 py-1 text-slate-400 transition hover:border-brand-cyan/40 hover:text-brand-cyan"
              >
                {h}
              </button>
            ))}
            <button
              onClick={() => { setHistory([]); try { localStorage.removeItem(HISTORY_KEY); } catch {} }}
              className="text-slate-600 hover:text-slate-400"
            >
              清空
            </button>
          </div>
        )}

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
            {data.provider === "mock" && (
              <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
                <p className="font-medium">当前为演示示例数据，条目链接不可访问</p>
                {data.note ? (
                  <p className="mt-1 text-xs leading-relaxed text-amber-300/80">
                    真实检索未能返回结果：{data.note}
                  </p>
                ) : (
                  <p className="mt-1 text-xs leading-relaxed text-amber-300/80">
                    网站尚未配置真实检索密钥（Bing 检索服务已于 2025 年 8 月停止服务）。
                    在部署平台配置 TAVILY_API_KEY 或 BRAVE_API_KEY 后，这里将返回真实全网结果，链接可直接打开。
                  </p>
                )}
              </div>
            )}
            {data.note && data.provider !== "mock" && (
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
              {data.results.map((r, i) => {
                const mock = data.provider === "mock";
                const watched = isWatched(r.url);
                return (
                  <li key={i} className="glass glass-hover p-5">
                    {mock ? (
                      <span className="text-lg font-medium text-slate-300">{r.title}</span>
                    ) : (
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-lg font-medium text-brand-cyan hover:underline">
                        {r.title}
                      </a>
                    )}
                    <p className="mt-2 text-sm leading-relaxed text-slate-300">{r.snippet}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span className="rounded-full border border-white/10 px-2 py-0.5">{r.source}</span>
                      {r.publishedAt && <span>📅 {r.publishedAt}</span>}
                      {!mock && (
                        <button
                          onClick={() => toggleWatch({ title: r.title, url: r.url, source: r.source })}
                          className={`rounded-full px-2.5 py-1 transition ${watched ? "bg-brand-cyan/20 text-brand-cyan" : "border border-white/15 text-slate-300 hover:border-brand-cyan/50 hover:text-brand-cyan"}`}
                        >
                          {watched ? "⭐ 已关注" : "☆ 关注此信息"}
                        </button>
                      )}
                      {mock ? (
                        <span className="ml-auto rounded-full border border-amber-500/30 px-2 py-0.5 text-amber-300/80">
                          示例条目 · 不可访问
                        </span>
                      ) : (
                        <>
                          <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-brand-cyan hover:underline">
                            查看原文 ↗
                          </a>
                          <button
                            onClick={() => openLead(r.title)}
                            className="ml-auto rounded-full bg-brand-blue/20 px-2.5 py-1 text-brand-blue transition hover:bg-brand-blue/30"
                          >
                            让顾问深挖这条 →
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="mt-8 glass border-brand-violet/30 p-6 text-center">
              <p className="text-lg font-semibold text-white">
                订阅「{queryEcho || "你的关键词"}」持续追踪
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
                留下联系方式，我们按此方向持续为你跟进最新政策、供应商与商机情报。
              </p>
              {isMock ? (
                <p className="mx-auto mt-4 max-w-md rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
                  ⚠️ 当前展示的是演示示例数据，暂不可提交留资。请稍后重试，待真实检索恢复后再订阅。
                </p>
              ) : (
                <button onClick={() => openLead("")} className="btn-primary mt-4">
                  免费获取定制情报
                </button>
              )}
            </div>
          </div>
        )}

        {!data && !loading && !error && (
          <div className="mt-10 text-center text-slate-500">
            选一个场景或输入关键词，开始你的第一次精准检索 🚀
          </div>
        )}
      </div>

      {showLead && (
        <LeadModal
          query={queryEcho || q}
          focusTitle={leadTitle}
          watchlist={leadTitle ? [] : watchlist}
          demo={isMock}
          onClose={() => setShowLead(false)}
        />
      )}

      {showWatch && (
        <WatchlistModal
          items={watchlist}
          onRemove={(url) => {
            setWatchlist((prev) => {
              const next = prev.filter((x) => x.url !== url);
              try { localStorage.setItem(WATCH_KEY, JSON.stringify(next)); } catch {}
              return next;
            });
          }}
          onSubmit={() => { setShowWatch(false); setLeadTitle(""); setShowLead(true); }}
          onClose={() => setShowWatch(false)}
        />
      )}
    </main>
  );
}

function LeadModal({
  query,
  focusTitle,
  watchlist,
  demo,
  onClose,
}: {
  query: string;
  focusTitle: string;
  watchlist: WatchItem[];
  demo?: boolean;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Lead>({ name: "", phone: "", company: "", query });
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  const contextQuery = useMemo(() => {
    const base = query ? `关键词：${query}` : "";
    const titles = focusTitle
      ? `关注条目：${focusTitle}`
      : watchlist.length
        ? `关注清单：${watchlist.map((w) => w.title).slice(0, 5).join("；")}`
        : "";
    return [base, titles].filter(Boolean).join("｜").slice(0, 100);
  }, [query, focusTitle, watchlist]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, query: contextQuery, ...(demo ? { demo: true } : {}) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "提交失败");
      setDone(true);
    } catch (e: any) {
      setErr(e.message || "提交失败，请稍后重试");
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
              你的检索方向与关注内容已同步给顾问，将尽快与你联系。
            </p>
            <button onClick={onClose} className="btn-primary mt-5">关闭</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <h3 className="text-lg font-semibold text-white">留下联系方式，获取深度情报</h3>
            <p className="text-xs text-slate-400">将同步：{contextQuery || "—"}</p>
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
            {err && <p className="text-xs text-red-400">{err}</p>}
            <div className="flex gap-2">
              <button type="submit" className="btn-primary flex-1">提交</button>
              <button type="button" onClick={onClose} className="btn-ghost">取消</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function WatchlistModal({
  items,
  onRemove,
  onSubmit,
  onClose,
}: {
  items: WatchItem[];
  onRemove: (url: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4 backdrop-blur"
      onClick={onClose}
    >
      <div
        className="glass w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-white">⭐ 我的关注清单</h3>
        <p className="mt-1 text-xs text-slate-500">
          关注清单与搜索历史仅保存在本机浏览器，换设备或清除缓存后不会同步；提交给顾问后才会写入服务端线索库。
        </p>
        {items.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">
            还没有关注任何信息。检索后在结果条目上点「☆ 关注此信息」，即可在此汇总并交给顾问深挖。
          </p>
        ) : (
          <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto">
            {items.map((w) => (
              <li key={w.url} className="flex items-start gap-2 rounded-xl border border-white/10 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <a href={w.url} target="_blank" rel="noopener noreferrer" className="line-clamp-2 text-slate-200 hover:text-brand-cyan">
                    {w.title}
                  </a>
                  <div className="mt-1 text-xs text-slate-500">{w.source}</div>
                </div>
                <button onClick={() => onRemove(w.url)} className="shrink-0 text-xs text-slate-500 hover:text-red-400">
                  移除
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-5 flex gap-2">
          {items.length > 0 && (
            <button onClick={onSubmit} className="btn-primary flex-1">
              交给顾问深挖这 {items.length} 条
            </button>
          )}
          <button onClick={onClose} className="btn-ghost">关闭</button>
        </div>
      </div>
    </div>
  );
}
