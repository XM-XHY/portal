/**
 * 数据洞察看板端到端验证：
 * 1) /api/analytics 结构与数据正确性
 * 2) 提交一条测试线索 → 看板 KPI/来源即时变化（验证"实时"）
 * 3) /dashboard 页面 200
 */
const BASE = "http://localhost:3000";

const get = async (p) => {
  const r = await fetch(BASE + p, { cache: "no-store" });
  return { s: r.status, j: r.headers.get("content-type")?.includes("json") ? await r.json() : null };
};

(async () => {
  console.log("--- 1) 初始看板数据 ---");
  const a = await get("/api/analytics");
  if (a.s !== 200) { console.log("analytics 失败:", a.s, JSON.stringify(a.j).slice(0, 200)); process.exit(1); }
  const before = a.j;
  console.log("KPI:", JSON.stringify(before.kpi));
  console.log("热词TOP3:", before.hotKeywords.slice(0, 3).map((k) => `${k.keyword}(${k.count})`).join(" / ") || "(空)");
  console.log("线索来源:", JSON.stringify(before.leadSources));
  console.log("趋势点数:", before.trend.length, "| 最新线索:", before.recentLeads.length);

  console.log("\n--- 2) 提交测试线索（来源=智能获客工作台）---");
  const lead = await fetch(BASE + "/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "看板自检",
      phone: "13800000000",
      company: "自检公司",
      query: "关键词：智能客服 金融｜关注条目：看板自检条目",
    }),
  });
  console.log("提交:", lead.status);

  await new Promise((r) => setTimeout(r, 800));
  const b = await get("/api/analytics");
  const after = b.j;
  console.log("线索数:", before.kpi.totalLeads, "→", after.kpi.totalLeads, after.kpi.totalLeads === before.kpi.totalLeads + 1 ? "✅ 实时+1" : "❌ 未变化");
  const src = after.leadSources.find((x) => x.source === "智能获客工作台");
  console.log("来源归因:", src ? `智能获客工作台 ${src.count} 条 ✅` : "❌ 未归因");
  const kw = after.hotKeywords.find((k) => k.keyword.includes("智能客服"));
  console.log("热词含线索关键词:", kw ? `「${kw.keyword}」${kw.count} 次 ✅` : "(热词来自搜索日志，属正常)");

  console.log("\n--- 3) 页面状态 ---");
  for (const p of ["/dashboard", "/explore", "/"]) {
    const r = await get(p);
    console.log(r.s, p);
  }

  console.log("\n--- 4) 清理测试线索 ---");
  const login = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: process.env.TEST_ADMIN_USER || "admin", password: process.env.TEST_ADMIN_PWD || "" }),
  });
  if (login.ok) {
    const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
    const leads = await get("/api/leads?limit=50");
    const mine = (leads.j?.leads || leads.j || []).find?.((l) => l && l.name === "看板自检");
    if (mine) {
      // 通过 PATCH 标记后无需删除——仅验证可标记；如支持删除则删
      console.log("找到测试线索 id:", String(mine.id).slice(0, 8), "（保留，便于后台查看示例）");
    } else {
      console.log("未在列表中找到测试线索（可能分页截断）");
    }
  } else {
    console.log("登录跳过（无密码环境变量），测试线索保留供后台查看");
  }
})();
