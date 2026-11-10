/**
 * 把「全科提分导师」三个会员套餐写进后台付费配置 contents(type=paycfg)。
 *
 * 价格放在数据库而不是写死在代码里，运营可在后台「产品付费」直接调价。
 * 已存在的其它商品（sched / balance / 产品中心条目）原样保留。
 *
 * 用法：node scripts/set-work-pay-items.mjs [--dry-run]
 * 密钥从 .env.local 读取，不经过命令行参数。
 */
import fs from "node:fs";

const DRY = process.argv.includes("--dry-run");
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
const BASE =
  env.CLOUDBASE_PG_REST_BASE ||
  `https://${env.CLOUDBASE_ENV_ID || "xm-xhy-d6gct2tdec159c251"}.api.tcloudbasegateway.com/v1/rdb/rest`;

const ITEMS = {
  work_m: { paid: true, amount: 29 },
  work_q: { paid: true, amount: 79 },
  work_y: { paid: true, amount: 299 },
};

if (!KEY) {
  console.error("缺少 CLOUDBASE_PG_API_KEY，请检查 .env.local");
  process.exit(1);
}

const url = `${BASE}/contents?id=eq.paycfg-main&type=eq.paycfg&select=id,type,body`;
const r = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` }, cache: "no-store" });
const rows = await r.json();
if (!r.ok || !Array.isArray(rows) || !rows.length) {
  console.error("读取 paycfg 失败:", r.status, JSON.stringify(rows).slice(0, 300));
  process.exit(1);
}

const cfg = JSON.parse(rows[0].body || "{}");
const before = { ...(cfg.items || {}) };
cfg.items = { ...before, ...ITEMS };

console.log("原有商品键:", Object.keys(before).join(", ") || "(空)");
console.log("新增/更新:", JSON.stringify(ITEMS));
if (DRY) {
  console.log("--dry-run：不写入。合并后 items =", JSON.stringify(cfg.items));
  process.exit(0);
}

const patch = await fetch(`${BASE}/contents?id=eq.paycfg-main&type=eq.paycfg`, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  },
  body: JSON.stringify({ body: JSON.stringify(cfg) }),
  cache: "no-store",
});
if (!patch.ok) {
  console.error("写入失败:", patch.status, (await patch.text()).slice(0, 300));
  process.exit(1);
}

const chk = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` }, cache: "no-store" });
const after = JSON.parse((await chk.json())[0].body || "{}");
console.log("写入完成，回查 items =", JSON.stringify(after.items));
