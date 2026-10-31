import { NextResponse } from "next/server";
import { getLeads, getSearchLogs } from "@/lib/store";

export const dynamic = "force-dynamic";

export type HotKeyword = { keyword: string; count: number };
export type SourceSlice = { source: string; count: number };
export type TrendPoint = { date: string; searches: number; leads: number };
export type RecentLead = {
  name: string;
  company: string;
  status: string;
  at: string;
  source: string;
};

export type AnalyticsResponse = {
  kpi: {
    totalSearches: number;
    totalLeads: number;
    todaySearches: number;
    todayLeads: number;
    conversionRate: number; // 线索数 / 搜索次数
    contactedRate: number; // 已跟进 / 线索总数
  };
  hotKeywords: HotKeyword[];
  leadSources: SourceSlice[];
  statusDist: { new: number; contacted: number };
  trend: TrendPoint[]; // 近 14 天
  recentLeads: RecentLead[]; // 最新 5 条（姓名/手机脱敏）
  updatedAt: string;
};

const DAYS = 14;

function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 从线索 query 上下文推断来源渠道与获客关键词 */
function parseSource(query: string): { source: string; keyword: string } {
  const q = (query || "").trim();
  const kw = q.match(/关键词[:：]\s*([^｜|]+)/);
  const keyword = kw ? kw[1].trim() : "";
  if (q.startsWith("关键词：")) return { source: "智能获客工作台", keyword };
  if (q.includes("订阅")) return { source: "关键词订阅追踪", keyword };
  if (q.startsWith("预约演示")) return { source: "产品演示预约", keyword };
  if (q) return { source: "官网留资表单", keyword };
  return { source: "其他渠道", keyword };
}

function maskName(name: string): string {
  const n = (name || "").trim();
  if (!n) return "匿名";
  return n.length <= 1 ? n : n[0] + "*".repeat(Math.min(n.length - 1, 2));
}

/** 把分散的搜索词归并为热词（保留原始词 + 去掉空白后合并近似词） */
function normalizeKeyword(q: string): string {
  return (q || "").trim().replace(/\s+/g, " ").slice(0, 40);
}

export async function GET() {
  const [leads, searchLogs] = await Promise.all([getLeads(), getSearchLogs()]);
  const now = new Date();
  const today = dayKey(now.toISOString());

  // 近 14 天日期轴
  const days: string[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(dayKey(d.toISOString()));
  }

  // 搜索热词（Top 10）
  const kwMap = new Map<string, HotKeyword>();
  for (const log of searchLogs) {
    const k = normalizeKeyword(log.q);
    if (!k) continue;
    const prev = kwMap.get(k);
    kwMap.set(k, { keyword: k, count: (prev ? prev.count : 0) + 1 });
  }
  const hotKeywords = Array.from(kwMap.values()).sort((a, b) => b.count - a.count).slice(0, 10);

  // 线索来源分布
  const srcMap = new Map<string, number>();
  const kwLeadMap = new Map<string, number>();
  for (const lead of leads) {
    const { source, keyword } = parseSource(lead.query);
    srcMap.set(source, (srcMap.get(source) || 0) + 1);
    if (keyword) kwLeadMap.set(keyword, (kwLeadMap.get(keyword) || 0) + 1);
  }
  const leadSources = Array.from(srcMap.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);

  // 每日趋势
  const searchByDay = new Map<string, number>();
  for (const log of searchLogs) {
    const k = dayKey(log.at);
    if (k) searchByDay.set(k, (searchByDay.get(k) || 0) + 1);
  }
  const leadByDay = new Map<string, number>();
  for (const lead of leads) {
    const k = dayKey(lead.at);
    if (k) leadByDay.set(k, (leadByDay.get(k) || 0) + 1);
  }
  const trend = days.map((date) => ({
    date,
    searches: searchByDay.get(date) || 0,
    leads: leadByDay.get(date) || 0,
  }));

  // 状态与 KPI
  const contacted = leads.filter((l) => l.status === "contacted").length;
  const totalSearches = searchLogs.length;
  const totalLeads = leads.length;
  const kpi = {
    totalSearches,
    totalLeads,
    todaySearches: searchByDay.get(today) || 0,
    todayLeads: leadByDay.get(today) || 0,
    conversionRate: totalSearches > 0 ? totalLeads / totalSearches : 0,
    contactedRate: totalLeads > 0 ? contacted / totalLeads : 0,
  };

  // 最新线索（脱敏，不含手机号）
  const recentLeads: RecentLead[] = leads.slice(0, 5).map((l) => ({
    name: maskName(l.name),
    company: l.company || "未填",
    status: l.status,
    at: l.at,
    source: parseSource(l.query).source,
  }));

  const body: AnalyticsResponse = {
    kpi,
    hotKeywords,
    leadSources,
    statusDist: { new: totalLeads - contacted, contacted },
    trend,
    recentLeads,
    updatedAt: now.toISOString(),
  };

  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store" },
  });
}
