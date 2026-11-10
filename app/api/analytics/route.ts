import { NextResponse } from "next/server";
import { getLeads, getSearchLogs } from "@/lib/store";
import { getAdminFromCookie } from "@/lib/session";
import { can } from "@/lib/auth";

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
    /** 由搜索实际带来的线索数（关键词匹配 + 30 分钟内的搜索行为） */
    convertedLeads: number;
    todaySearches: number;
    todayLeads: number;
    /** 真实转化：搜索转化线索数 / 搜索次数（不再是「全部线索 / 全部搜索」的无关比值） */
    conversionRate: number;
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
  // 看板含线索来源、公司名称与最近线索明细，属经营数据：
  // 必须与 /api/search-logs 一样要求登录 + search.logs 权限，禁止匿名读取。
  const admin = await getAdminFromCookie();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!can(admin, "search.logs")) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

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

  // 「搜索→线索」真实转化归因：
  // 一条线索只有在其留资前 30 分钟内出现过同关键词的搜索（或无线索关键词时出现过任意搜索），
  // 才算由搜索带来。旧口径直接用「全部线索 ÷ 全部搜索」，两者没有因果关系，数值没有业务含义。
  const ATTR_WINDOW = 30 * 60 * 1000;
  const logsByKeyword = new Map<string, number[]>();
  const allLogTimes: number[] = [];
  for (const log of searchLogs) {
    const t = Date.parse(log.at);
    if (!Number.isFinite(t)) continue;
    allLogTimes.push(t);
    const k = normalizeKeyword(log.q);
    if (!k) continue;
    const arr = logsByKeyword.get(k) || [];
    arr.push(t);
    logsByKeyword.set(k, arr);
  }
  allLogTimes.sort((a, b) => a - b);
  for (const arr of logsByKeyword.values()) arr.sort((a, b) => a - b); // 二分要求升序
  function attributed(leadAt: string, keyword: string): boolean {
    const t = Date.parse(leadAt);
    if (!Number.isFinite(t)) return false;
    const times = keyword ? logsByKeyword.get(normalizeKeyword(keyword)) : allLogTimes;
    if (!times?.length) return false;
    // 找最大的 <= t 的时间戳，判断是否落在归因窗口内
    let lo = 0, hi = times.length - 1, best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= t) { best = times[mid]; lo = mid + 1; }
      else hi = mid - 1;
    }
    return best >= 0 && t - best <= ATTR_WINDOW;
  }
  const convertedLeads = leads.filter((l) =>
    attributed(l.at, parseSource(l.query).keyword)
  ).length;

  const kpi = {
    totalSearches,
    totalLeads,
    convertedLeads,
    todaySearches: searchByDay.get(today) || 0,
    todayLeads: leadByDay.get(today) || 0,
    conversionRate: totalSearches > 0 ? convertedLeads / totalSearches : 0,
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
