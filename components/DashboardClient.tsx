"use client";

import { useCallback, useEffect, useState } from "react";
import type { AnalyticsResponse } from "@/app/api/analytics/route";

const POLL_MS = 30_000; // 每 30 秒自动刷新

const STATUS_LABEL: Record<string, string> = {
  new: "待跟进",
  contacted: "已跟进",
};

function fmtPct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}

/* ---------------- 趋势图（SVG 双序列） ---------------- */
function TrendChart({ trend }: { trend: AnalyticsResponse["trend"] }) {
  const W = 640;
  const H = 200;
  const PAD = { l: 34, r: 10, t: 12, b: 24 };
  const max = Math.max(4, ...trend.map((d) => Math.max(d.searches, d.leads)));
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (iw * i) / Math.max(1, trend.length - 1);
  const y = (v: number) => PAD.t + ih - (ih * v) / max;
  const line = (key: "searches" | "leads") =>
    trend.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(" ");
  const area = `${line("searches")} L${x(trend.length - 1).toFixed(1)},${PAD.t + ih} L${PAD.l},${PAD.t + ih} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="近 14 天趋势">
      {[0, 0.25, 0.5, 0.75, 1].map((r) => (
        <g key={r}>
          <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t + ih * r} y2={PAD.t + ih * r} stroke="rgba(255,255,255,0.08)" />
          <text x={PAD.l - 6} y={PAD.t + ih * r + 4} textAnchor="end" fontSize="10" fill="#64748b">
            {Math.round(max * (1 - r))}
          </text>
        </g>
      ))}
      <path d={area} fill="url(#gradSearch)" opacity="0.35" />
      <path d={line("searches")} fill="none" stroke="#38bdf8" strokeWidth="2" />
      <path d={line("leads")} fill="none" stroke="#a78bfa" strokeWidth="2" strokeDasharray="5 3" />
      {trend.map((d, i) =>
        i % 2 === 0 ? (
          <text key={d.date} x={x(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="#64748b">
            {d.date.slice(5)}
          </text>
        ) : null
      )}
      <defs>
        <linearGradient id="gradSearch" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* ---------------- 横向条形图 ---------------- */
function BarList({
  items,
  color,
  unit,
}: {
  items: { label: string; count: number }[];
  color: string;
  unit: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.count));
  if (!items.length) return <p className="py-6 text-center text-sm text-slate-500">暂无数据</p>;
  return (
    <ul className="space-y-2.5">
      {items.map((it, idx) => (
        <li key={it.label + idx} className="text-xs">
          <div className="mb-1 flex items-center justify-between">
            <span className="truncate text-slate-300">
              {idx === 0 && <span className="mr-1">🔥</span>}
              {it.label}
            </span>
            <span className="ml-2 shrink-0 font-medium text-slate-400">
              {it.count} {unit}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${(it.count / max) * 100}%`, background: color }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function DashboardClient() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [error, setError] = useState<string>("");
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/analytics", { cache: "no-store" });
      if (!res.ok) throw new Error(`接口返回 ${res.status}`);
      setData((await res.json()) as AnalyticsResponse);
      setError("");
      setLastFetch(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const kpiCards = data
    ? [
        { label: "累计搜索", value: String(data.kpi.totalSearches), sub: `今日 +${data.kpi.todaySearches}`, color: "text-brand-cyan" },
        { label: "累计线索", value: String(data.kpi.totalLeads), sub: `今日 +${data.kpi.todayLeads}`, color: "text-brand-violet" },
        { label: "搜索→线索转化率", value: fmtPct(data.kpi.conversionRate), sub: "线索数 ÷ 搜索次数", color: "text-emerald-400" },
        { label: "线索跟进率", value: fmtPct(data.kpi.contactedRate), sub: `已跟进 ${data.statusDist.contacted} / 共 ${data.kpi.totalLeads}`, color: "text-amber-400" },
      ]
    : [];

  return (
    <div>
      {/* 工具条 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">数据洞察看板</h1>
          <p className="mt-1 text-sm text-slate-400">
            实时汇聚搜索日志、线索与转化数据 · 每 30 秒自动刷新
            {lastFetch && <span className="ml-2 text-slate-500">（更新于 {lastFetch.toLocaleTimeString("zh-CN")}）</span>}
          </p>
        </div>
        <button onClick={load} disabled={refreshing} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
          {refreshing ? "刷新中…" : "⟳ 立即刷新"}
        </button>
      </div>

      {error && (
        <div className="mt-6 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
          数据加载失败：{error}
        </div>
      )}

      {!data && !error && <p className="mt-10 text-center text-sm text-slate-500">正在读取数据库…</p>}

      {data && (
        <>
          {/* KPI 卡片 */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kpiCards.map((c) => (
              <div key={c.label} className="glass p-5">
                <p className="text-xs text-slate-400">{c.label}</p>
                <p className={`mt-2 text-3xl font-bold ${c.color}`}>{c.value}</p>
                <p className="mt-1 text-xs text-slate-500">{c.sub}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {/* 搜索热词 */}
            <section className="glass p-6">
              <h2 className="text-sm font-semibold text-white">🔍 搜索热词 TOP 10</h2>
              <p className="mb-4 mt-1 text-xs text-slate-500">来自访客在「智能获客」中的真实检索记录</p>
              <BarList
                items={data.hotKeywords.map((k) => ({ label: k.keyword, count: k.count }))}
                color="linear-gradient(90deg,#38bdf8,#818cf8)"
                unit="次"
              />
            </section>

            {/* 线索来源 */}
            <section className="glass p-6">
              <h2 className="text-sm font-semibold text-white">🎯 线索来源分布</h2>
              <p className="mb-4 mt-1 text-xs text-slate-500">按留资入口自动归因（获客工作台 / 订阅 / 预约演示 / 表单）</p>
              <BarList
                items={data.leadSources.map((s) => ({ label: s.source, count: s.count }))}
                color="linear-gradient(90deg,#a78bfa,#f472b6)"
                unit="条"
              />
            </section>

            {/* 趋势图 */}
            <section className="glass p-6 lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-white">📈 近 14 天搜索与线索趋势</h2>
                <div className="flex items-center gap-4 text-xs text-slate-400">
                  <span className="flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 rounded bg-[#38bdf8]" />搜索次数</span>
                  <span className="flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 rounded bg-[#a78bfa]" />新增线索</span>
                </div>
              </div>
              <div className="mt-3">
                <TrendChart trend={data.trend} />
              </div>
            </section>

            {/* 转化漏斗 */}
            <section className="glass p-6">
              <h2 className="text-sm font-semibold text-white">🧭 线索状态转化</h2>
              <p className="mb-4 mt-1 text-xs text-slate-500">数据与后台「线索管理」实时同步</p>
              <div className="space-y-4">
                {[
                  { label: "待跟进", value: data.statusDist.new, color: "bg-amber-500" },
                  { label: "已跟进", value: data.statusDist.contacted, color: "bg-emerald-500" },
                ].map((s) => {
                  const total = Math.max(1, data.kpi.totalLeads);
                  return (
                    <div key={s.label}>
                      <div className="mb-1 flex justify-between text-xs text-slate-300">
                        <span>{s.label}</span>
                        <span>{s.value} 条 · {fmtPct(s.value / total)}</span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/5">
                        <div className={`h-full rounded-full transition-all duration-700 ${s.color}`} style={{ width: `${(s.value / total) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-5 rounded-lg border border-white/10 bg-white/5 p-3 text-xs leading-relaxed text-slate-400">
                💡 洞察提示：热词反映市场需求，转化率反映获客质量。可在「智能获客」工作台针对高频词优化投放关键词。
              </p>
            </section>

            {/* 最新线索动态 */}
            <section className="glass p-6">
              <h2 className="text-sm font-semibold text-white">🕒 最新线索动态</h2>
              <p className="mb-4 mt-1 text-xs text-slate-500">姓名已脱敏，完整信息请到后台「线索管理」查看</p>
              {data.recentLeads.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">暂无线索，去首页留个测试线索试试 →</p>
              ) : (
                <ul className="divide-y divide-white/5">
                  {data.recentLeads.map((l, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <span className="font-medium text-slate-200">{l.name}</span>
                        <span className="ml-2 text-xs text-slate-500">{l.company}</span>
                        <span className="ml-2 rounded-full border border-white/10 px-2 py-0.5 text-xs text-slate-400">{l.source}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 text-xs">
                        <span className={`rounded-full px-2 py-0.5 ${l.status === "contacted" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
                          {STATUS_LABEL[l.status] || l.status}
                        </span>
                        <span className="text-slate-500">{timeAgo(l.at)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
