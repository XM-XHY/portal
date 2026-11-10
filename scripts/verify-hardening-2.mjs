/**
 * 第二批加固（🟠/🟡 全量修复）上线后的线上冒烟验证。
 * ⚠️ admin 口令通过 argv 传入，不要内联（沙箱会遮蔽内联密钥）。
 *
 * 用法：node scripts/verify-hardening-2.mjs "<admin口令>"
 *
 * 覆盖：付费墙票据、管理员账号 CRUD、知识中枢材料持久化、分享链接管理、
 *       看板真实转化口径、共享限流、公众号接口、默认口令提示。
 * 脚本会自动清理自己创建的测试账号，不会改动线上价格或订单。
 */
const BASE = process.env.DRILL_BASE || "https://www.cnxhy.top";
const password = process.argv[2];
if (!password) throw new Error('用法：node scripts/verify-hardening-2.mjs "<admin口令>"');

let cookie = "";
let pass = 0;
let fail = 0;
let skip = 0;

function check(name, ok, detail) {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? " | " + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? " | " + detail : ""}`); }
}
function note(name, detail) { skip++; console.log(`⏭️  ${name}${detail ? " | " + detail : ""}`); }

async function api(pathname, init = {}, auth = false) {
  const headers = { ...(init.headers || {}) };
  if (auth && cookie) headers.Cookie = cookie;
  const res = await fetch(BASE + pathname, { ...init, headers, redirect: "manual" });
  const raw = res.headers.get("set-cookie");
  if (raw) cookie = raw.split(";")[0];
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, text, json, ct: res.headers.get("content-type") || "" };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ==================== 匿名态 ==================== */
console.log("— 匿名态 —");

let r = await api("/api/admins");
check("匿名读后台账号列表被拦截", r.status === 401, `HTTP ${r.status}`);

r = await api("/api/hub/materials");
check("匿名读我的材料被拦截", r.status === 401, `HTTP ${r.status}`);

r = await api("/api/schedule/share");
check("匿名读分享链接列表被拦截", r.status === 401, `HTTP ${r.status}`);

r = await api("/api/analytics");
check("匿名读数据看板被拦截", r.status === 401, `HTTP ${r.status}`);

r = await api("/api/schedule/export?token=__smoke_fake__");
check(
  "分享页导出无票据不可直接下载（付费墙）",
  r.status !== 200 && !r.ct.includes("spreadsheetml"),
  `HTTP ${r.status} / ${r.json?.error || r.ct}`
);

r = await api("/api/schedule/export?token=__smoke_fake__&grant=forged.grant");
check(
  "伪造 grant 仍被拒绝",
  r.status !== 200 && !r.ct.includes("spreadsheetml"),
  `HTTP ${r.status} / ${r.json?.error || r.ct}`
);

r = await api("/api/pay/self-report", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ productId: "sched" }),
});
check(
  "真实支付通道下自助申报被禁用（不能绕过付费）",
  r.status === 403,
  `HTTP ${r.status} / ${r.json?.error || ""}`
);

r = await api("/api/wechat/mp?signature=bad&timestamp=1&nonce=2&echostr=x");
check("公众号消息接口签名校验生效", r.status === 403, `HTTP ${r.status}`);

r = await api("/api/pay/order", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ productId: "__smoke_free_item__" }),
});
check(
  "免费商品下单返回免费授权票据",
  r.status === 200 && r.json?.free === true && typeof r.json?.grant === "string",
  `HTTP ${r.status} / grant=${r.json?.grant ? "有" : "无"}`
);

/**
 * 共享存储限流：用响应快的家长查询接口连打（30 次/分钟）。
 * 若只在进程内计数，多实例部署下请求被分摊到不同实例，30 次以内不会出现 429；
 * 只有计数真正落到共享存储，才会在第 31 次前被拦截。
 */
let first429 = 0;
let statuses = [];
for (let i = 1; i <= 34; i++) {
  r = await api(`/api/balance/query?code=__smoke__&name=__smoke__&i=${i}`);
  statuses.push(r.status);
  if (r.status === 429) { first429 = i; break; }
}
check(
  "共享存储限流生效（30 次/分钟，跨实例累计）",
  first429 > 0 && first429 <= 31,
  `第 ${first429 || "无"} 次返回 429 / 状态序列 ${statuses.slice(0, 6).join(",")}…`
);

/* ==================== 登录态 ==================== */
console.log("— 登录态 —");
r = await api("/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "admin", password }),
});
const loggedIn = r.status === 200 && !!r.json?.ok;
check("管理员登录", loggedIn, `HTTP ${r.status}`);
if (!loggedIn) {
  console.error("\n登录失败，登录态验证跳过。");
  process.exit(1);
}

r = await api("/api/auth/me", {}, true);
check(
  "/api/auth/me 返回初始口令提示字段",
  r.status === 200 && typeof r.json?.mustChangePassword === "boolean",
  `HTTP ${r.status} / mustChangePassword=${r.json?.mustChangePassword}`
);

r = await api("/api/admins", {}, true);
check(
  "后台账号列表返回 id（可管理）",
  r.status === 200 && Array.isArray(r.json) && r.json.every((a) => !!a.id),
  `HTTP ${r.status} / ${Array.isArray(r.json) ? r.json.length : "-"} 个账号`
);

/* 管理员账号 CRUD（自动清理） */
const uname = `smoke_${Date.now().toString(36).slice(-6)}`;
let createdId = "";
try {
  r = await api("/api/admins", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: uname, password: "Smoke9Test", role: "viewer" }),
  }, true);
  createdId = r.json?.item?.id || "";
  check("新增后台账号", r.status === 200 && !!createdId, `HTTP ${r.status} / ${uname}`);

  if (createdId) {
    r = await api("/api/admins", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: createdId, role: "lead" }),
    }, true);
    check("修改账号角色", r.status === 200 && r.json?.ok, `HTTP ${r.status}`);

    r = await api("/api/admins", {}, true);
    const row = (r.json || []).find((a) => a.id === createdId);
    check("角色变更已生效", row?.role === "lead", `role=${row?.role || "-"}`);

    r = await api("/api/admins", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: createdId, password: "Smoke9Reset" }),
    }, true);
    check("重置他人密码", r.status === 200 && r.json?.ok, `HTTP ${r.status}`);
  }
} finally {
  if (createdId) {
    r = await api(`/api/admins?id=${encodeURIComponent(createdId)}`, { method: "DELETE" }, true);
    check("删除测试账号（清理）", r.status === 200 && r.json?.ok, `HTTP ${r.status}`);
  }
}

r = await api("/api/hub/materials", {}, true);
check(
  "我的材料接口可用（结果已落库）",
  r.status === 200 && Array.isArray(r.json?.items),
  `HTTP ${r.status} / ${Array.isArray(r.json?.items) ? r.json.items.length : "-"} 条材料`
);

r = await api("/api/schedule/share", {}, true);
check(
  "分享链接列表接口可用（含有效期/吊销状态）",
  r.status === 200 && Array.isArray(r.json?.items),
  `HTTP ${r.status} / ${Array.isArray(r.json?.items) ? r.json.items.length : "-"} 条分享`
);

r = await api("/api/schedule/share?token=__nonexistent__", { method: "DELETE" }, true);
check("吊销不存在的分享返回 404", r.status === 404, `HTTP ${r.status}`);

r = await api("/api/analytics", {}, true);
check(
  "看板 KPI 含真实转化口径字段",
  r.status === 200 && typeof r.json?.kpi?.convertedLeads === "number" && typeof r.json?.kpi?.conversionRate === "number",
  `HTTP ${r.status} / 转化线索 ${r.json?.kpi?.convertedLeads ?? "-"} / 搜索 ${r.json?.kpi?.totalSearches ?? "-"}`
);

/* 产品资料下载：按是否配价分别断言，不改线上任何配置 */
r = await api("/api/contents?type=product", {}, true);
const products = Array.isArray(r.json) ? r.json : [];
r = await api("/api/payconfig", {}, true);
const priced = Object.entries(r.json?.items || {}).filter(([, v]) => v?.paid && v?.amount > 0).map(([k]) => k);
if (products.length) {
  let docId = "", docProduct = "";
  for (const p of products) {
    const d = await api(`/api/products/doc?productId=${encodeURIComponent(p.id)}`, {}, true);
    if (Array.isArray(d.json) && d.json.length) { docId = d.json[0].id; docProduct = p.id; break; }
  }
  if (docId) {
    r = await api(`/api/products/doc/${encodeURIComponent(docId)}`);
    const shouldPay = priced.includes(docProduct);
    check(
      `产品资料下载接口按付费配置放行（${shouldPay ? "需付费" : "免费"}）`,
      shouldPay ? r.status === 402 : r.status === 200,
      `HTTP ${r.status} / productId=${docProduct}`
    );
    // 管理员预览豁免
    r = await api(`/api/products/doc/${encodeURIComponent(docId)}?mode=view`, {}, true);
    check("后台内容管理员预览资料豁免", r.status === 200, `HTTP ${r.status}`);
  } else {
    note("产品资料下载", "线上暂无 pdoc 资料，跳过该文件级校验（付费墙已由分享导出接口验证）");
  }
} else {
  note("产品资料下载", "未取到产品列表，跳过");
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败 / ${skip} 跳过`);
process.exit(fail ? 1 : 0);
