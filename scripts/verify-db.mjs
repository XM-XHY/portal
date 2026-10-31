/**
 * Supabase 持久化端到端自检（密钥通过命令行参数传入，不要硬编码）。
 * 用法：node scripts/verify-db.mjs "<secret key>"
 *
 * 验证链路：读站点信息 → 模拟后台改公司名 → 重新读取确认持久化 → 还原
 *          → 模拟访客提交线索 → 查询 → 清理 → 各表数据量盘点
 */
const KEY = process.argv.slice(2).filter((a) => !a.startsWith("--"))[0];
if (!KEY) {
  console.error("用法：node scripts/verify-db.mjs \"<SUPABASE_SERVICE_ROLE_KEY>\"");
  process.exit(1);
}
const REST =
  (process.env.SUPABASE_URL || "https://umtqzvgqblleyjxohfwb.supabase.co").replace(/\/+$/, "") +
  "/rest/v1/";
const h = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" };

const j = async (u, o = {}) => {
  const r = await fetch(REST + u, { ...o, headers: { ...h, ...(o.headers || {}) } });
  const t = await r.text();
  let b;
  try { b = JSON.parse(t); } catch { b = t; }
  return { s: r.status, b, t };
};

console.log("密钥末 6 位 …" + KEY.slice(-6));
console.log("端点 " + REST + "\n");

console.log("--- 1) 读取当前企业信息 ---");
const a = await j("site_info?id=eq.1&select=company_name,contact_name,phone,email");
if (!Array.isArray(a.b) || !a.b[0]) {
  console.log("   读取失败", a.s, a.t.slice(0, 160));
  process.exit(2);
}
const orig = a.b[0];
console.log("   ", JSON.stringify(orig));

console.log("\n--- 2) 模拟后台修改公司名 ---");
const w = await j("site_info?id=eq.1", {
  method: "PATCH",
  headers: { ...h, Prefer: "return=minimal" },
  body: JSON.stringify({ company_name: orig.company_name + "_连通自检" }),
});
console.log("    写入:", w.s === 204 ? "成功 (204)" : w.s + " " + String(w.t).slice(0, 120));

console.log("\n--- 3) 模拟刷新页面重新读取（验证持久化）---");
const c = await j("site_info?id=eq.1&select=company_name");
const persisted = String(c.b?.[0]?.company_name || "").includes("连通自检");
console.log("    ", c.b?.[0]?.company_name, persisted ? "→ 持久化成功" : "→ 未生效");

console.log("\n--- 4) 还原原值 ---");
await j("site_info?id=eq.1", {
  method: "PATCH",
  headers: { ...h, Prefer: "return=minimal" },
  body: JSON.stringify({ company_name: orig.company_name }),
});
const d = await j("site_info?id=eq.1&select=company_name");
console.log("    ", d.b?.[0]?.company_name, d.b?.[0]?.company_name === orig.company_name ? "已还原" : "还原失败");

console.log("\n--- 5) 模拟访客提交线索 ---");
const ins = await j("leads", {
  method: "POST",
  headers: { ...h, Prefer: "return=representation" },
  body: JSON.stringify({
    name: "连通自检",
    phone: "00000000000",
    company: "自检",
    query: "selftest",
    status: "new",
    note: "",
  }),
});
const id = Array.isArray(ins.b) && ins.b[0] && ins.b[0].id;
console.log("    插入:", ins.s === 201 ? "成功 (201)" : ins.s + " " + String(ins.t).slice(0, 120));
if (id) {
  const q = await j("leads?id=eq." + id + "&select=name,phone,status");
  console.log("    查询:", q.s, JSON.stringify(q.b));
  const del = await j("leads?id=eq." + id, { method: "DELETE", headers: { ...h, Prefer: "return=minimal" } });
  console.log("    清理:", del.s === 204 ? "已删除 (204)" : del.s);
}

console.log("\n--- 6) 各表数据量盘点 ---");
for (const t of ["admins", "contents", "leads", "search_logs", "audit_logs"]) {
  const r = await j(t + "?select=id");
  console.log("   ", t.padEnd(12), r.s, Array.isArray(r.b) ? r.b.length + " 条" : String(r.t).slice(0, 80));
}

console.log("\n完成。");
