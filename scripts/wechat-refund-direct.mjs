// 对「数据库记录已丢失、但微信侧真实存在」的订单做退款：按微信流水号(transaction_id)退款。
//
// 用法（argv 传参，避免密钥被沙箱内联替换）：
//   node scripts/wechat-refund-direct.mjs <transaction_id>                 # 只查询，不动资金
//   node scripts/wechat-refund-direct.mjs <transaction_id> --confirm       # 真实全额退款
//   node scripts/wechat-refund-direct.mjs --out-trade-no <no> [--confirm]  # 按商户单号退款
//   node scripts/wechat-refund-direct.mjs --query-refund <out_refund_no>   # 查退款结果
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function loadEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnvLocal();

function resolvePemFile(fileEnv) {
  const file = process.env[fileEnv];
  if (!file) return "";
  try {
    const p = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
    return fs.readFileSync(p, "utf8").trim();
  } catch {
    return "";
  }
}
function pemOpt(raw) {
  if (!raw) return "";
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}
function resolvePem(valueEnv, fileEnv) {
  return resolvePemFile(fileEnv) || pemOpt(process.env[valueEnv]);
}

const mchId = process.env.WECHAT_PAY_MCH_ID;
const serial = process.env.WECHAT_PAY_SERIAL;
const privateKey = resolvePem("WECHAT_PAY_PRIVATE_KEY", "WECHAT_PAY_PRIVATE_KEY_FILE");
const pubkey = resolvePem("WECHAT_PAY_PUBKEY", "WECHAT_PAY_PUBKEY_FILE");
const base = "https://api.mch.weixin.qq.com";

for (const [k, v] of Object.entries({ mchId, serial, privateKey, pubkey })) {
  if (!v) throw new Error("缺少凭据：" + k);
}

function rsaSign(msg) {
  return crypto.createSign("RSA-SHA256").update(msg, "utf8").sign(privateKey, "base64");
}
function authHeader(method, urlPath, body) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString("hex");
  const msg = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${body}\n`;
  const signature = rsaSign(msg);
  return `WECHATPAY2-SHA256-RSA2048 mchid="${mchId}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${serial}"`;
}
async function call(method, urlPath, body) {
  const res = await fetch(base + urlPath, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Accept-Language": "zh-CN",
      "User-Agent": "xm-portal/1.0",
      Authorization: authHeader(method, urlPath, body),
    },
    body: method === "GET" ? undefined : body,
  });
  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text };
}

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? String(argv[i + 1] || "") : "";
};

/* ---------------- 查退款结果 ---------------- */
if (argv[0] === "--query-refund") {
  const outRefundNo = argv[1];
  if (!outRefundNo) throw new Error("缺少 out_refund_no");
  // 注意：退款查询接口不接受 mchid 查询参数（商户号由认证头识别），带了会报 PARAM_ERROR
  const r = await call("GET", `/v3/refund/domestic/refunds/${encodeURIComponent(outRefundNo)}`, "");
  console.log("HTTP:", r.status);
  console.log(JSON.stringify(r.json, null, 2));
  process.exit(0);
}

/* ---------------- 查订单 ---------------- */
let queryPath;
if (argv[0] === "--out-trade-no") {
  const no = argv[1];
  if (!no) throw new Error("缺少 out_trade_no");
  queryPath = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(no)}?mchid=${mchId}`;
} else {
  const tid = argv[0];
  if (!tid) throw new Error("缺少 transaction_id（或 --out-trade-no）");
  queryPath = `/v3/pay/transactions/id/${encodeURIComponent(tid)}?mchid=${mchId}`;
}

const q = await call("GET", queryPath, "");
console.log("==== 订单查询 ====");
console.log("HTTP:", q.status);
console.log(JSON.stringify(q.json, null, 2));
const order = q.json || {};
if (q.status !== 200 || !order.transaction_id) {
  console.log("\n未查到该订单，终止。");
  process.exit(1);
}

const transactionId = String(order.transaction_id || "");
const outTradeNo = String(order.out_trade_no || "");
const totalFen = Number(order.amount?.total || 0);
const paidFen = Number(order.amount?.payer_total || totalFen);

console.log("\n==== 小结 ====");
console.log("交易状态 :", order.trade_state);
console.log("商户单号 :", outTradeNo);
console.log("微信流水 :", transactionId);
console.log("金额     :", totalFen, "分（实付", paidFen, "分）");
console.log("支付时间 :", order.success_time || "-");
console.log("商品     :", order.description || order.attach || "-");

const confirm = argv.includes("--confirm");
if (!confirm) {
  console.log("\n（只读模式）确认无误后追加 --confirm 执行退款。");
  process.exit(0);
}
if (order.trade_state !== "SUCCESS") {
  console.log("\n⚠️ 订单状态不是 SUCCESS，无法退款。");
  process.exit(1);
}

/* ---------------- 退款 ---------------- */
const refundFen = Number(flag("--refund-fen") || paidFen || totalFen);
const suffix = (outTradeNo || transactionId).replace(/[^A-Za-z0-9]/g, "").slice(-10).toUpperCase();
const outRefundNo = flag("--refund-no") || `R${suffix}${Date.now().toString(36).slice(-4).toUpperCase()}`;
const reason = flag("--reason") || "测试订单退款";

const body = JSON.stringify({
  transaction_id: transactionId,
  out_refund_no: outRefundNo,
  reason: reason.slice(0, 60),
  amount: { refund: refundFen, total: totalFen, currency: "CNY" },
});

const r = await call("POST", "/v3/refund/domestic/refunds", body);
console.log("\n==== 退款申请 ====");
console.log("退款单号 :", outRefundNo, "| 金额:", refundFen, "分");
console.log("HTTP:", r.status);
console.log(JSON.stringify(r.json, null, 2));

if (r.status === 200 && r.json.status) {
  const qr = await call("GET", `/v3/refund/domestic/refunds/${encodeURIComponent(outRefundNo)}?mchid=${mchId}`, "");
  console.log("\n==== 退款回查 ====");
  console.log("状态     :", qr.json.status, qr.json.status === "SUCCESS" ? "✅ 已到账" : "(处理中/异常)");
  console.log("网关单号 :", qr.json.refund_id || "-");
  console.log("退款金额 :", qr.json.amount?.refund, "分 | 去向:", qr.json.user_received_account || "-");
  console.log("到账时间 :", qr.json.success_time || "-");
  console.log("\n复查命令：node scripts/wechat-refund-direct.mjs --query-refund " + outRefundNo);
}
