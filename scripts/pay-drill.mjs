/**
 * 支付 + 退款全流程演练脚本（走线上站点 HTTP 接口，含后台登录）。
 *
 * ⚠️ 口令一律通过 argv 传入，不要内联（沙箱会遮蔽内联密钥）。
 *
 * 用法：
 *   node scripts/pay-drill.mjs "<admin密码>" --set-price 1      # 把「均衡分班」改成 1 元（其余条目保持原样）
 *   node scripts/pay-drill.mjs "<admin密码>" --create           # 下 1 元单，生成二维码 docs/pay-drill-<id>.png
 *   node scripts/pay-drill.mjs "<admin密码>" --status <orderId> # 查订单状态
 *   node scripts/pay-drill.mjs "<admin密码>" --refund <orderId> ["原因"]  # 后台退款（走 DB 状态流转）
 *   node scripts/pay-drill.mjs "<admin密码>" --list             # 后台订单列表 + 统计
 *   node scripts/pay-drill.mjs "<admin密码>" --restore-price 30 # 恢复 30 元
 */
import fs from "node:fs";
import path from "node:path";
import QRCode from "qrcode";

const BASE = process.env.DRILL_BASE || "https://www.cnxhy.top";
const argv = process.argv.slice(2);
const password = argv[0] && !argv[0].startsWith("--") ? argv[0] : "";
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? String(argv[i + 1] || "") : "";
};

let cookie = "";

function saveCookie(res) {
  const raw = res.headers.get("set-cookie");
  if (raw) cookie = raw.split(";")[0];
}

async function api(pathname, init = {}, needAuth = false) {
  const headers = { ...(init.headers || {}) };
  if (needAuth && cookie) headers.Cookie = cookie;
  const res = await fetch(BASE + pathname, { ...init, headers, redirect: "manual" });
  saveCookie(res);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text.slice(0, 300) };
  }
  return { status: res.status, json };
}

async function login() {
  const r = await api("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password }),
  });
  if (r.status !== 200 || !r.json.ok) throw new Error("登录失败：" + JSON.stringify(r.json));
  console.log("✓ 已登录：", r.json.username, "(", r.json.role, ")");
}

/* ---------------- 改价 ---------------- */
async function setPrice(amount) {
  await login();
  const cfg = (await api("/api/payconfig", {}, true)).json;
  const items = { ...(cfg.items || {}) };
  items.balance = { paid: amount > 0, amount };
  const r = await api("/api/payconfig", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, qrImageUrl: cfg.qrImageUrl || "", qrNote: cfg.qrNote || "" }),
  }, true);
  console.log("改价结果：", JSON.stringify(r.json?.config?.items || r.json));
}

/* ---------------- 下单 ---------------- */
async function createOrder() {
  const r = await api("/api/pay/order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId: "balance", client: "drill-script" }),
  });
  console.log("下单 HTTP:", r.status, JSON.stringify(r.json));
  const codeUrl = r.json.codeUrl;
  const id = r.json.orderId;
  if (!codeUrl || !id) process.exit(1);
  const out = path.join(process.cwd(), "docs", `pay-drill-${id}.png`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await QRCode.toFile(out, codeUrl, { width: 480, margin: 2 });
  console.log("\n二维码已生成：", out);
  console.log("订单号：", id, "| 金额：¥", r.json.amount, "| 过期：", r.json.expiresAt);
  console.log("code_url：", codeUrl);
  console.log("\n下一步：用微信扫码支付 1 元，然后执行：");
  console.log(`  node scripts/pay-drill.mjs "<pwd>" --status ${id}`);
  console.log(`  node scripts/pay-drill.mjs "<pwd>" --refund ${id} "演练退款"`);
}

/* ---------------- 查单 ---------------- */
async function status(id) {
  const r = await api(`/api/pay/order?id=${encodeURIComponent(id)}`);
  console.log("订单状态：", JSON.stringify(r.json));
}

/* ---------------- 后台列表 ---------------- */
async function list() {
  await login();
  const r = await api("/api/admin/orders?status=all&limit=50", {}, true);
  const j = r.json;
  console.log("统计：", JSON.stringify(j.stat));
  for (const o of j.orders || []) {
    console.log(
      `- ${o.id} | ${o.productTitle} | ¥${o.amount} | ${o.status} | 流水 ${o.tradeNo || "-"} | 已退 ¥${o.refundedAmount || 0}${
        o.refunds?.length ? " | 退款单 " + o.refunds.map((x) => `${x.refundNo}(${x.status},¥${x.amount})`).join(",") : ""
      }`
    );
  }
}

/* ---------------- 同步退款状态 ---------------- */
async function syncRefund(id) {
  await login();
  const r = await api("/api/admin/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, action: "sync-refund" }),
  }, true);
  console.log("同步退款 HTTP:", r.status, "|", r.json.note || r.json.error);
  const o = r.json.order;
  if (o) {
    console.log("订单：", o.id, "| ¥" + o.amount, "|", o.status, "| 已退 ¥" + (o.refundedAmount || 0));
    console.log("退款记录：", JSON.stringify(o.refunds, null, 2));
  }
}

/* ---------------- 后台退款 ---------------- */
async function refund(id, reason) {
  await login();
  const before = await api(`/api/admin/orders?status=all&q=${encodeURIComponent(id)}`, {}, true);
  const o = (before.json.orders || [])[0];
  console.log("退款前：", o ? `${o.id} | ¥${o.amount} | ${o.status} | 已退 ¥${o.refundedAmount || 0}` : "未找到订单");

  const r = await api("/api/admin/orders/refund", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, reason: reason || "支付+退款全流程演练" }),
  }, true);
  console.log("\n退款接口 HTTP:", r.status);
  console.log(JSON.stringify(r.json, null, 2));
  if (r.status !== 200) process.exit(1);

  const after = await api(`/api/admin/orders?status=all&q=${encodeURIComponent(id)}`, {}, true);
  const o2 = (after.json.orders || [])[0];
  console.log("\n退款后订单：", o2 ? JSON.stringify({
    id: o2.id, amount: o2.amount, status: o2.status, refundedAmount: o2.refundedAmount, refunds: o2.refunds,
  }, null, 2) : "未找到");
}

(async () => {
  if (!password) throw new Error("第一个参数请传 admin 密码（argv 传入，避免被沙箱遮蔽）");
  if (argv.includes("--set-price")) return setPrice(Number(flag("--set-price")));
  if (argv.includes("--restore-price")) return setPrice(Number(flag("--restore-price")));
  if (argv.includes("--create")) return createOrder();
  if (argv.includes("--status")) return status(flag("--status"));
  if (argv.includes("--refund")) return refund(flag("--refund"), flag("--reason") || argv[argv.indexOf("--refund") + 2] || "");
  if (argv.includes("--sync-refund")) return syncRefund(flag("--sync-refund"));
  if (argv.includes("--list")) return list();
  console.log("请指定操作：--set-price / --create / --status / --refund / --sync-refund / --list / --restore-price");
})().catch((e) => {
  console.error("失败：", e.message);
  process.exit(1);
});
