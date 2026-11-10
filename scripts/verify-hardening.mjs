/**
 * 安全加固上线后的线上冒烟验证（走真实 HTTP 接口）。
 * ⚠️ admin 口令通过 argv 传入，不要内联。
 *
 * 用法：node scripts/verify-hardening.mjs "<admin口令>"
 *
 * 验证项：
 *  1. 匿名 /api/analytics → 401（看板数据不再公开泄露）
 *  2. 匿名 /dashboard → 200 且渲染登录卡片
 *  3. 匿名 /api/balance/publish → 401（发布需登录）
 *  4. 登录 /api/analytics → 200
 *  5. 登录发布查询码 → 200 且带 owner；list 能按账号列出；delete 可清理
 *  6. 微信支付通道未受影响：匿名 /api/pay/status → 401，登录订单列表 → 200
 */
const BASE = process.env.DRILL_BASE || "https://www.cnxhy.top";
const password = process.argv[2];
if (!password) throw new Error("用法：node scripts/verify-hardening.mjs \"<admin口令>\"");

let cookie = "";
let pass = 0;
let fail = 0;

function check(name, ok, detail) {
  if (ok) {
    pass++;
    console.log(`✅ ${name}${detail ? " | " + detail : ""}`);
  } else {
    fail++;
    console.log(`❌ ${name}${detail ? " | " + detail : ""}`);
  }
}

async function api(pathname, init = {}, auth = false) {
  const headers = { ...(init.headers || {}) };
  if (auth && cookie) headers.Cookie = cookie;
  const res = await fetch(BASE + pathname, { ...init, headers, redirect: "manual" });
  const raw = res.headers.get("set-cookie");
  if (raw) cookie = raw.split(";")[0];
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, text, json };
}

async function login() {
  const r = await api("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password }),
  });
  check("管理员登录", r.status === 200 && !!r.json?.ok, `HTTP ${r.status} ${r.json?.role || ""}`);
  return r.status === 200;
}

/* 1~3：匿名态 */
let r = await api("/api/analytics");
check("匿名 /api/analytics 被拦截", r.status === 401, `HTTP ${r.status} ${r.json?.error || ""}`);

r = await api("/dashboard");
check(
  "匿名 /dashboard 渲染登录卡片",
  r.status === 200 && r.text.includes("数据洞察看板") && r.text.includes("登录"),
  `HTTP ${r.status} / ${r.text.length} 字节`
);

r = await api("/balance");
check("/balance 页面含老师登录入口", r.status === 200 && r.text.includes("登录老师账号"), `HTTP ${r.status}`);

r = await api("/api/balance/publish", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title: "未登录冒烟（应被拒）", entries: [{ className: "1班", names: ["测试"] }] }),
});
check("匿名发布查询码被拦截", r.status === 401, `HTTP ${r.status} ${r.json?.error || ""}`);

/* 4~6：登录态 */
if (!(await login())) {
  console.error("\n登录失败，后续登录态验证跳过。");
  process.exit(1);
}

r = await api("/api/analytics", {}, true);
check("登录 /api/analytics 正常", r.status === 200 && !!r.json?.kpi, `HTTP ${r.status} / ${r.json?.kpi?.totalLeads ?? "-"} 条线索`);

const title = "上线冒烟测试（自动清理）";
r = await api("/api/balance/publish", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title, entries: [{ className: "1班", names: ["甲", "乙"] }, { className: "2班", names: ["丙"] }] }),
}, true);
const code = r.json?.code || "";
check("登录后可发布且写入 owner", r.status === 200 && !!code && r.json.owner === "admin", `HTTP ${r.status} / code=${code} / owner=${r.json?.owner || "-"}`);

if (code) {
  r = await api("/api/balance/manage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "list" }),
  }, true);
  const found = (r.json?.items || []).find((x) => x.code === code);
  check(
    "服务端按账号列出发布（无需本机密钥）",
    r.status === 200 && !!found && found.owner === "admin" && r.json.mode === "account",
    `HTTP ${r.status} / mode=${r.json?.mode} / ${r.json?.items?.length ?? 0} 条`
  );

  r = await api("/api/balance/manage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "delete", code }),
  }, true);
  check("账号可删除自己的发布（测试数据清理）", r.status === 200 && r.json?.deleted === code, `HTTP ${r.status}`);
}

r = await api("/api/pay/status");
check("微信支付状态接口匿名仍 401", r.status === 401, `HTTP ${r.status}`);

r = await api("/api/admin/orders?status=all&limit=10", {}, true);
check(
  "订单列表正常（微信通道未受影响）",
  r.status === 200 && Array.isArray(r.json?.orders),
  `HTTP ${r.status} / ${r.json?.orders?.length ?? "-"} 笔订单`
);

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
