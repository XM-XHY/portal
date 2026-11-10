/**
 * 作品中心「共用主站数据库」端到端验证。
 *
 * 覆盖：匿名状态 → 注册（服务端会话）→ 学习数据上行/回读 → 会员下单
 *      → 模拟支付回调 → 幂等权益发放 → 订单激活 → 退出 → 清理测试数据。
 *
 * 不产生真实扣款：Native 预下单只生成二维码；"支付成功"通过直接改写测试订单状态模拟，
 * 验证结束后订单、账号及其级联数据全部删除。
 *
 * 用法：node scripts/verify-work-cloud.mjs [baseUrl]
 *   本地：node scripts/verify-work-cloud.mjs http://127.0.0.1:3100
 *   线上：node scripts/verify-work-cloud.mjs https://www.cnxhy.top
 * 密钥从 .env.local 读取，绝不写进命令行参数或日志。
 */
import fs from "node:fs";

const BASE = (process.argv[2] || "http://127.0.0.1:3100").replace(/\/$/, "");
const envPath = new URL("../.env.local", import.meta.url);
const env = {};
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (v.length > 1 && (v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0]) v = v.slice(1, -1);
    env[m[1]] = v;
  }
}
const KEY = env.CLOUDBASE_PG_API_KEY;
const PG =
  env.CLOUDBASE_PG_REST_BASE ||
  `https://${env.CLOUDBASE_ENV_ID || "xm-xhy-d6gct2tdec159c251"}.api.tcloudbasegateway.com/v1/rdb/rest`;

const account = `probe_${Date.now().toString(36)}@test.local`;
const password = "Probe#2026Test";
const client = "dev_probe_" + Date.now().toString(36);
let cookie = "";
let orderId = "";
let userId = "";

const j = async (r) => {
  const t = await r.text();
  try { return JSON.parse(t); } catch { return t.slice(0, 200); }
};
const ok = (b) => (b ? "✓" : "✗");
const call = async (path, method = "GET", body) => {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body) headers["Content-Type"] = "application/json";
  const r = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const setCookie = r.headers.get("set-cookie") || "";
  const m = setCookie.match(/work_session=([^;,\s]+)/);
  if (m) cookie = `work_session=${m[1]}`;
  return { r, d: await j(r) };
};
const pg = async (path, method = "GET", body) => {
  const r = await fetch(PG + path, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      ...(body ? { "Content-Type": "application/json", Prefer: "return=representation" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const t = await r.text();
  let d;
  try { d = JSON.parse(t); } catch { d = t.slice(0, 200); }
  return { r, d };
};

async function cleanup() {
  if (orderId) await pg(`/contents?id=eq.${encodeURIComponent(orderId)}&type=eq.order`, "DELETE");
  if (userId) await pg(`/work_users?id=eq.${encodeURIComponent(userId)}`, "DELETE");
}

async function main() {
  console.log("目标:", BASE, "\n测试账号:", account, "\n");
  if (!KEY) throw new Error("缺少 CLOUDBASE_PG_API_KEY，无法做直连校验与清理");

  try {
    // 1 匿名
    {
      const { r, d } = await call("/api/works/auth");
      console.log(`[1] 匿名状态       ${ok(r.status === 200 && d.loggedIn === false)}  → ${r.status}`);
    }

    // 2 注册
    {
      const { r, d } = await call("/api/works/auth", "POST", { action: "register", account, password });
      const pass = r.status === 200 && d.ok === true && !!cookie;
      console.log(`[2] 云端注册       ${ok(pass)}  → ${r.status} ${JSON.stringify(d).slice(0, 100)}`);
      if (!pass) throw new Error("注册失败，中止");
    }

    // 3 登录态 + 试用
    {
      const { r, d } = await call("/api/works/auth");
      userId = d.userId || "";
      const pass = r.status === 200 && d.loggedIn === true && d.trialUntil > Date.now();
      console.log(`[3] 会话与 7 天试用 ${ok(pass)}  → account=${d.account} trialUntil=${new Date(d.trialUntil).toISOString().slice(0, 10)}`);
      console.log(`    userId=${userId}`);
    }

    // 4 学习数据上行
    {
      const { r, d } = await call("/api/works/data", "POST", {
        mistakes: {
          subject: "数学",
          records: [{ id: "ERR-test1", text: "云端同步探针", kp: "一元二次方程", level: "B", err: "计算错误", date: "2026-11-05", mastered: false }],
        },
        flywheel: [{ ts: Date.now(), subj: "数学", ver: "人教", grade: "初三", raw: "raw", corrected: "fixed", engine: "local" }],
      });
      console.log(`[4] 学习数据上行   ${ok(r.status === 200 && d.ok === true)}  → ${r.status}`);
    }

    // 5 回读
    {
      const { r, d } = await call("/api/works/auth");
      const pass =
        r.status === 200 &&
        d.mistakes?.["数学"]?.length === 1 &&
        d.mistakes["数学"][0].text === "云端同步探针" &&
        d.flywheel?.length === 1;
      console.log(`[5] 云端回读       ${ok(pass)}  → 错题 ${d.mistakes?.["数学"]?.length || 0} 条 / 飞轮 ${d.flywheel?.length || 0} 条`);
    }

    // 6 会员下单（走主站微信 Native，不扣款）
    {
      const { r, d } = await call("/api/works/pay/create", "POST", { plan: "m", client, reqId: "probe_" + Date.now().toString(36) });
      orderId = d.orderId || "";
      // 线上是微信 Native（weixin://…），本地 mock 通道返回模拟码，两者都算下单成功
      const pass = r.status === 200 && !!orderId && String(d.codeUrl || "").length > 5;
      console.log(`[6] 会员下单       ${ok(pass)}  → ${r.status} 订单 ${orderId} 金额 ${d.amount} 元 days=${d.days}`);
      if (!pass) console.log("    返回:", JSON.stringify(d).slice(0, 200));
    }

    // 7 待支付轮询
    if (orderId) {
      const { r, d } = await call(`/api/works/pay/status?id=${encodeURIComponent(orderId)}`);
      console.log(`[7] 待支付状态     ${ok(r.status === 200 && d.paid === false && d.status === "pending")}  → ${r.status} status=${d.status}`);
    }

    // 8 模拟支付成功（直接改测试订单状态，等价于网关回调后的落库结果）
    if (orderId) {
      const got = await pg(`/contents?select=id,body&id=eq.${encodeURIComponent(orderId)}&type=eq.order`);
      const row = Array.isArray(got.d) ? got.d[0] : null;
      const o = row ? JSON.parse(row.body) : null;
      if (!o) throw new Error("测试订单未落库");
      o.status = "paid";
      o.paidAt = new Date().toISOString();
      o.tradeNo = "PROBE" + Date.now();
      const patched = await pg(`/contents?id=eq.${encodeURIComponent(orderId)}&type=eq.order`, "PATCH", { body: JSON.stringify(o) });
      console.log(`[8] 模拟支付回调   ${ok(patched.r.ok)}  → PATCH ${patched.r.status}`);
    }

    // 9 status 自动发放权益
    if (orderId) {
      const { r, d } = await call(`/api/works/pay/status?id=${encodeURIComponent(orderId)}`);
      console.log(`[9] 权益自动发放   ${ok(r.status === 200 && d.paid === true && d.granted === true)}  → paid=${d.paid} granted=${d.granted} plan=${d.plan} days=${d.days}`);
    }

    // 10 claim 幂等（同一订单不能重复叠加天数）
    if (orderId) {
      const { r, d } = await call("/api/works/pay/claim", "POST", { orderId, client });
      const ent = await pg(`/work_entitlements?select=id,order_id,paid_until&order_id=eq.${encodeURIComponent(orderId)}`);
      const n = Array.isArray(ent.d) ? ent.d.length : 0;
      console.log(`[10] 激活幂等      ${ok(r.status === 200 && d.paid === true && n === 1)}  → claim ${r.status}，权益记录 ${n} 条`);
    }

    // 11 会员到期时间来自服务端
    {
      const { r, d } = await call("/api/works/auth");
      const pass = r.status === 200 && d.paidUntil > Date.now() && d.auth?.isPaid === true;
      console.log(`[11] 会员生效      ${ok(pass)}  → paidUntil=${new Date(d.paidUntil).toISOString().slice(0, 10)} isPaid=${d.auth?.isPaid}`);
    }

    // 12 退出
    {
      const { r, d } = await call("/api/works/auth", "POST", { action: "logout" });
      console.log(`[12] 退出登录      ${ok(r.status === 200 && d.loggedIn === false)}  → ${r.status}`);
    }
  } finally {
    await cleanup();
    const chk = orderId
      ? await pg(`/contents?select=id&id=eq.${encodeURIComponent(orderId)}&type=eq.order`)
      : { d: [] };
    const chkUser = userId ? await pg(`/work_users?select=id&id=eq.${encodeURIComponent(userId)}`) : { d: [] };
    const clean = (!Array.isArray(chk.d) || chk.d.length === 0) && (!Array.isArray(chkUser.d) || chkUser.d.length === 0);
    console.log(`\n[清理] 测试订单/账号 ${ok(clean)}  → 残留订单 ${Array.isArray(chk.d) ? chk.d.length : "?"} / 账号 ${Array.isArray(chkUser.d) ? chkUser.d.length : "?"}`);
  }
}

main().catch((e) => { console.error("验证异常:", e.message); process.exitCode = 1; });
