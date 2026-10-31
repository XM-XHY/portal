/**
 * 本地复现「后台保存企业信息」全链路，定位线上保存失败的真实报错。
 * 用法：先 npm start（已配置 .env.local），再 node scripts/test-site-api.mjs
 */
import fs from "node:fs";

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const BASE = "http://localhost:3000";
const USER = env.TEST_ADMIN_USER || "admin";
const PW = env.TEST_ADMIN_PW || "";

console.log("Supabase URL 已配置:", !!env.SUPABASE_URL, env.SUPABASE_URL || "");
console.log("Service key 末 6 位:", (env.SUPABASE_SERVICE_ROLE_KEY || "").slice(-6));
console.log("测试账号:", USER, "\n");

let cookie = "";

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const t = await res.text();
  let j;
  try { j = JSON.parse(t); } catch { j = t; }
  return { s: res.status, b: j, t };
}

console.log("--- 1) GET /api/site（未登录读取）---");
const g0 = await call("GET", "/api/site");
console.log("   ", g0.s, JSON.stringify(g0.b).slice(0, 200));

console.log("\n--- 2) 登录 ---");
const login = await call("POST", "/api/auth/login", { username: USER, password: PW });
console.log("   ", login.s, JSON.stringify(login.b).slice(0, 200));
if (login.s !== 200) {
  console.log("    登录失败，后续无意义，终止");
  process.exit(1);
}
console.log("    cookie:", cookie ? cookie.slice(0, 30) + "…" : "(无)");

console.log("\n--- 3) PUT /api/site 修改公司名（关键步骤）---");
const orig = g0.b.companyName;
const put = await call("PUT", "/api/site", {
  companyName: orig + "_本地自检",
  slogan: g0.b.slogan,
  contactName: g0.b.contactName,
  phone: g0.b.phone,
  email: g0.b.email,
  address: g0.b.address,
  icp: g0.b.icp,
});
console.log("    状态:", put.s);
console.log("    响应:", String(put.t).slice(0, 400));

console.log("\n--- 4) GET /api/site 验证是否落库 ---");
const g1 = await call("GET", "/api/site");
console.log("   ", g1.s, JSON.stringify(g1.b).slice(0, 200));
console.log("   ", String(g1.b.companyName).includes("本地自检") ? "→ 已保存" : "→ 未保存");

console.log("\n--- 5) 还原 ---");
await call("PUT", "/api/site", { ...g0.b, companyName: orig });
const g2 = await call("GET", "/api/site");
console.log("   ", g2.b.companyName === orig ? "已还原为 " + orig : "还原失败:" + g2.b.companyName);

console.log("\n--- 6) /api/auth/me 确认会话 ---");
const me = await call("GET", "/api/auth/me");
console.log("   ", me.s, JSON.stringify(me.b).slice(0, 160));
