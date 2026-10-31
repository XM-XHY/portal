/**
 * 一键连通 Supabase：校验密钥 → 写入 Vercel 加密环境变量 → 触发重新部署 → 线上验证
 *
 * 用法：
 *   node scripts/connect-supabase.mjs "sb_secret_xxx..."
 * 或：
 *   SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/connect-supabase.mjs
 */
import { createHash } from "node:crypto";

const KEY = process.argv[2] || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://umtqzvgqblleyjxohfwb.supabase.co";
const REST = SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1/";

const VERCEL_TOKEN = process.env.VERCEL_TOKEN || "";
const PROJECT_ID = process.env.VERCEL_PROJECT_ID || "prj_LQQvY8YKmkX9ufaVMIlXXc5rJ3za";
const TEAM_ID = process.env.VERCEL_ORG_ID || "team_jDWNPvAhjbZQ5hEbFHbmSny1";
const SITE = process.env.SITE || "https://xm-tech-portal.vercel.app";

const hdr = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" };

function jwtRole(k) {
  try {
    const p = k.split(".");
    if (p.length !== 3) return "(非 JWT：" + k.slice(0, 8) + "…)";
    const b = s => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(b(p[1])).role || "?";
  } catch {
    return "(无法解析)";
  }
}

async function req(url, init) {
  const r = await fetch(url, init);
  const t = await r.text();
  let j;
  try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j, text: t };
}

console.log("=== 1) 校验密钥 ===");
if (!KEY) { console.error("缺少密钥参数"); process.exit(1); }
console.log("密钥角色 role =", jwtRole(KEY));

const TABLES = ["site_info", "admins", "contents", "leads", "search_logs", "audit_logs"];
let ok = true;
for (const t of TABLES) {
  const r = await req(REST + t + "?select=*&limit=1", { headers: hdr });
  const good = r.status === 200;
  if (!good) ok = false;
  console.log(`  ${good ? "OK " : "FAIL"} ${t.padEnd(12)} ${r.status} ${good ? "" : String(r.text).slice(0, 120)}`);
}
if (!ok) {
  console.error("\n密钥不具备全部表的读权限，已中止（不会写入 Vercel）。");
  console.error("请到 Supabase 控制台 → Project Settings → API Keys → 复制 Secret key（service_role）。");
  process.exit(2);
}

// 写权限验证（用一条无害的 upsert：把 site_info 原样写回）
const cur = await req(REST + "site_info?id=eq.1&select=*", { headers: hdr });
if (cur.status !== 200 || !Array.isArray(cur.body) || !cur.body[0]) {
  console.error("site_info 无种子数据，请先执行 supabase/schema.sql");
  process.exit(3);
}
const row = cur.body[0];
const { id, updated_at, ...patch } = row;
const w = await req(REST + "site_info?id=eq.1", {
  method: "PATCH",
  headers: { ...hdr, Prefer: "return=minimal" },
  body: JSON.stringify(patch),
});
console.log(`  ${w.status >= 200 && w.status < 300 ? "OK " : "FAIL"} 写权限(site_info) ${w.status} ${w.status >= 200 && w.status < 300 ? "" : String(w.text).slice(0, 120)}`);
if (!(w.status >= 200 && w.status < 300)) {
  console.error("密钥无写权限，已中止。");
  process.exit(4);
}

console.log("\n=== 2) 写入 Vercel 环境变量 ===");
if (!VERCEL_TOKEN) { console.error("缺少 VERCEL_TOKEN，跳过部署环节"); process.exit(0); }
const vh = { Authorization: "Bearer " + VERCEL_TOKEN, "Content-Type": "application/json" };

for (const [key, value] of [
  ["SUPABASE_URL", SUPABASE_URL.replace(/\/rest\/v1\/?$/, "")],
  ["SUPABASE_SERVICE_ROLE_KEY", KEY],
]) {
  const r = await req(
    `https://api.vercel.com/v10/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`,
    { method: "POST", headers: vh, body: JSON.stringify({ key, value, type: "encrypted", target: ["production", "preview", "development"] }) }
  );
  console.log(`  env ${key}: ${r.status} ${r.status === 201 || r.status === 200 ? "已写入" : JSON.stringify(r.body).slice(0, 200)}`);
}

console.log("\n=== 3) 触发重新部署 ===");
const list = await req(`https://api.vercel.com/v6/deployments?projectId=${PROJECT_ID}&teamId=${TEAM_ID}&limit=1`, { headers: vh });
const lastUid = list.body?.deployments?.[0]?.uid;
console.log("  上一个部署:", lastUid);

let deployId = null;
for (const [desc, url, body] of [
  ["redeploy 端点", `https://api.vercel.com/v13/deployments/${lastUid}/redeploy?teamId=${TEAM_ID}`, { target: "production" }],
  ["integrations", `https://api.vercel.com/v1/integrations/deploy/${PROJECT_ID}/${lastUid}`, {}],
]) {
  const r = await req(url, { method: "POST", headers: vh, body: JSON.stringify(body) });
  if (r.status >= 200 && r.status < 300) {
    deployId = r.body?.id || r.body?.uid || r.body?.job?.id;
    console.log(`  ${desc}: ${r.status} → ${deployId || "(已排队)"}`);
    break;
  }
  console.log(`  ${desc}: ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
}
if (!deployId) {
  console.log("  未能自动获取新部署 id，请到 Vercel 控制台手动 Redeploy。");
  process.exit(0);
}

console.log("\n=== 4) 等待部署完成 ===");
for (let i = 0; i < 60; i++) {
  const r = await req(`https://api.vercel.com/v13/deployments/${deployId}?teamId=${TEAM_ID}`, { headers: vh });
  const s = r.body?.status || r.body?.state;
  process.stdout.write(`  [${i}] ${s}\r`);
  if (s === "READY") { console.log(`\n  部署完成：${r.body?.url ? "https://" + r.body.url : SITE}`); break; }
  if (s === "ERROR" || s === "CANCELED") { console.log("\n  部署失败:", JSON.stringify(r.body).slice(0, 400)); process.exit(5); }
  await new Promise(r2 => setTimeout(r2, 5000));
}

console.log("\n=== 5) 线上验证 ===");
for (const p of ["/", "/api/site", "/api/contents?type=product"]) {
  try {
    const r = await fetch(SITE + p);
    console.log(`  ${p} → ${r.status}`);
  } catch (e) {
    console.log(`  ${p} → 请求失败 ${e.message}（沙箱代理可能拦截 *.vercel.app）`);
  }
}

console.log("\n完成。密钥指纹 sha256 前 8 位:", createHash("sha256").update(KEY).digest("hex").slice(0, 8));
