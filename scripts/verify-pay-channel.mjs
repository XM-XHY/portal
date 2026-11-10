/**
 * 支付通道通达性验证（不产生任何真实扣款）
 *
 * 覆盖链路：
 *   1. 国产库 paycfg 可读（下单接口能拿到商品价格）
 *   2. 微信支付商户凭据有效 + 微信 API 网络可达（Native 预下单返回 codeUrl）
 *   3. 订单可写入共享数据库（限流桶 + 订单本身）
 *   4. 订单可回查（轮询状态接口）
 *   5. 国产库里确实存在这笔订单
 *   6. 清理测试订单，不留脏数据
 *
 * 用法：node scripts/verify-pay-channel.mjs [baseUrl]
 * 密钥从 .env.local 读取，绝不写进命令行参数或日志。
 */
import fs from "node:fs";

const BASE = (process.argv[2] || "https://www.cnxhy.top").replace(/\/$/, "");
const envPath = new URL("../.env.local", import.meta.url);

function readEnv() {
  const out = {};
  if (!fs.existsSync(envPath)) return out;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (v.length > 1 && (v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0]) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

const env = readEnv();
const PG_KEY = env.CLOUDBASE_PG_API_KEY;
const PG_BASE =
  env.CLOUDBASE_PG_REST_BASE ||
  `https://${env.CLOUDBASE_ENV_ID || "xm-xhy-d6gct2tdec159c251"}.api.tcloudbasegateway.com/v1/rdb/rest`;

const json = async (r) => {
  const t = await r.text();
  try { return JSON.parse(t); } catch { return t.slice(0, 200); }
};
const ok = (b) => (b ? "✓" : "✗");
let createdId = "";

async function main() {
  console.log("目标站点:", BASE);
  console.log("国产库网关:", PG_BASE.replace(/^https:\/\//, ""));
  console.log("API Key:", PG_KEY ? "已从 .env.local 读取" : "缺失（跳过直连校验）");
  console.log("");

  // 1) 查一个不存在的订单：能正常返回 404 说明数据层可读
  {
    const r = await fetch(`${BASE}/api/pay/order?id=__probe_not_exist__`, { cache: "no-store" });
    console.log(`[1] 数据层可读      ${ok(r.status === 404)}  GET /api/pay/order → ${r.status} ${JSON.stringify(await json(r)).slice(0, 90)}`);
  }

  // 2) Native 预下单：这是整条链最关键的一步
  {
    const r = await fetch(`${BASE}/api/pay/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: "sched", client: "pay-channel-probe" }),
      cache: "no-store",
    });
    const d = await json(r);
    const pass = r.status === 200 && typeof d.codeUrl === "string" && d.codeUrl.length > 10;
    console.log(`[2] 微信下单通道    ${ok(pass)}  POST /api/pay/order → ${r.status}`);
    if (pass) {
      createdId = d.orderId;
      console.log(`    订单号 ${d.orderId} | 金额 ${d.amount} 元 | provider ${d.provider} | codeUrl 长度 ${d.codeUrl.length}`);
      console.log(`    codeUrl 前缀 ${d.codeUrl.slice(0, 24)}…（已脱敏）`);
    } else {
      console.log("    返回:", JSON.stringify(d).slice(0, 300));
    }
  }

  if (!createdId) {
    console.log("\n下单未成功，后续步骤跳过。可能原因见上方错误信息。");
    return;
  }

  // 3) 轮询状态接口能读到刚写入的订单
  {
    const r = await fetch(`${BASE}/api/pay/order?id=${encodeURIComponent(createdId)}`, { cache: "no-store" });
    const d = await json(r);
    const pass = r.status === 200 && d.orderId === createdId && d.status === "pending";
    console.log(`[3] 订单回查        ${ok(pass)}  GET /api/pay/order?id=… → ${r.status} status=${d.status} paid=${d.paid}`);
  }

  // 4) 直连国产库，确认订单落在国产 PG（不是旧 Supabase、不是本地 JSON）
  if (PG_KEY) {
    const url = `${PG_BASE}/contents?select=id,type,body&id=eq.${encodeURIComponent(createdId)}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${PG_KEY}` }, cache: "no-store" });
    const d = await json(r);
    const pass = r.status === 200 && Array.isArray(d) && d.length === 1 && d[0].type === "order";
    console.log(`[4] 订单落国产库    ${ok(pass)}  PG REST → ${r.status} 命中 ${Array.isArray(d) ? d.length : 0} 行`);
    if (Array.isArray(d) && d[0]?.body) {
      const b = typeof d[0].body === "string" ? JSON.parse(d[0].body || "{}") : d[0].body;
      console.log(`    落库 productId=${b.productId} amount=${b.amount} status=${b.status}`);
    }
  } else {
    console.log("[4] 订单落国产库    -  跳过（无 API Key）");
  }

  // 5) 回调路由存在（GET 不打真实回调，只看路由是否挂载）
  {
    const r = await fetch(`${BASE}/api/pay/callback/wechat`, { cache: "no-store" });
    console.log(`[5] 回调路由可达    ${ok(r.status !== 404)}  GET /api/pay/callback/wechat → ${r.status}（${r.status === 404 ? "未挂载" : "已挂载，GET 非回调方法属正常"}）`);
  }

  // 6) 清理测试订单
  if (PG_KEY) {
    const url = `${PG_BASE}/contents?id=eq.${encodeURIComponent(createdId)}&type=eq.order`;
    const r = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${PG_KEY}`, Prefer: "return=minimal" },
      cache: "no-store",
    });
    const chk = await fetch(`${BASE}/api/pay/order?id=${encodeURIComponent(createdId)}`, { cache: "no-store" });
    const pass = (r.status === 204 || r.status === 200) && chk.status === 404;
    console.log(`[6] 清理测试订单    ${ok(pass)}  DELETE → ${r.status}，回查 → ${chk.status}`);
  } else {
    console.log("[6] 清理测试订单    -  跳过（无 API Key，请手动在后台删除探针订单 " + createdId + "）");
  }

  console.log("\n说明：Native 预下单只在微信侧创建一笔未支付订单，不会扣款，15 分钟后自动过期。");
}

main().catch((e) => { console.error("验证脚本异常:", e.message); process.exitCode = 1; });
