/** 验证获客工作台：精准查询词组装是否生效（观察服务端收到的 query 回显）+ 线索提交。 */
const BASE = process.env.BASE || "http://localhost:3000";

// 1) 组合搜索（行业+类型）：回显的 query 应包含行业与类型词
const r1 = await fetch(`${BASE}/api/search?q=${encodeURIComponent("智能客服 金融 案例实践 最新")}`);
const j1 = await r1.json();
console.log("组合检索:", r1.status, "| provider:", j1.provider, "| query 回显:", JSON.stringify(j1.query));
console.log("  结果数:", j1.results?.length, "| 首条:", j1.results?.[0]?.title?.slice(0, 40));
console.log("  summary:", j1.summary ? j1.summary.slice(0, 60) + "…" : "(无)");
await new Promise((r) => setTimeout(r, 3500));

// 2) 线索提交（模拟关注清单深挖）
const r2 = await fetch(`${BASE}/api/leads`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "获客工作台自检",
    phone: "13800000000",
    company: "自检",
    query: "关键词：智能客服 金融｜关注条目：某头部银行智能客服升级",
  }),
});
const j2 = await r2.json();
console.log("\n线索提交:", r2.status, JSON.stringify(j2));

// 3) 清理自检线索（需登录后台）
const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "admin", password: "#XHY-@350211" }),
});
const cookie = login.headers.get("set-cookie")?.split(";")[0] || "";
console.log("后台登录:", login.status, cookie ? "(已取得会话)" : "(无会话)");
if (cookie && j2.id) {
  const del = await fetch(`${BASE}/api/leads`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ id: j2.id, status: "contacted" }),
  });
  console.log("标记线索:", del.status);
}
