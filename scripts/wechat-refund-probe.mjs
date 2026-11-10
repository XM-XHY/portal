// 微信支付退款接口「探活」：用一笔不存在的商户订单号发起退款，
// 若返回业务级错误（如 ORDER_NOT_EXIST / RESOURCE_NOT_EXISTS），
// 则说明「签名 + 商户号 + 退款权限」全部校验通过（请求已到达微信业务层）。
// 不会产生任何真实资金变动。
//
// 用法：node scripts/wechat-refund-probe.mjs
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

const mchId = process.env.WECHAT_PAY_MCH_ID;
const serial = process.env.WECHAT_PAY_SERIAL;
const privateKeyFile = process.env.WECHAT_PAY_PRIVATE_KEY_FILE;

function readPem() {
  if (privateKeyFile && fs.existsSync(privateKeyFile)) return fs.readFileSync(privateKeyFile, "utf8");
  const inline = process.env.WECHAT_PAY_PRIVATE_KEY;
  if (inline) return inline.replace(/\\n/g, "\n");
  throw new Error("缺少商户私钥（WECHAT_PAY_PRIVATE_KEY_FILE 或 WECHAT_PAY_PRIVATE_KEY）");
}
const privateKey = readPem();

function rsaSign(msg) {
  return crypto.createSign("RSA-SHA256").update(msg).sign(privateKey, "base64");
}

function authHeader(method, urlPath, body) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString("hex");
  const msg = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${body}\n`;
  const signature = rsaSign(msg);
  return `WECHATPAY2-SHA256-RSA2048 mchid="${mchId}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${serial}"`;
}

const urlPath = "/v3/refund/domestic/refunds";
// 商户订单号最长 32 字符
const outTradeNo = "o_probe_" + Date.now().toString().slice(-8);
const body = JSON.stringify({
  out_trade_no: outTradeNo,
  out_refund_no: "Rprobe" + Date.now().toString().slice(-8),
  reason: "接口探活（不会产生真实退款）",
  amount: { refund: 1, total: 1, currency: "CNY" },
});

const res = await fetch(`https://api.mch.weixin.qq.com${urlPath}`, {
  method: "POST",
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
    "Accept-Language": "zh-CN",
    "User-Agent": "xm-portal/1.0",
    Authorization: authHeader("POST", urlPath, body),
  },
  body,
});
const text = await res.text();
console.log("HTTP:", res.status);
console.log("响应:", text.slice(0, 400));

if (res.status === 401 || text.includes("SIGN_ERROR")) {
  console.log("\n❌ 签名/凭据未通过：检查商户号、私钥、证书序列号是否配套。");
} else if (text.includes("NOT_EXIST") || text.includes("ORDER_NOT_EXIST") || text.includes("ORDERNOTEXIST")) {
  console.log("\n✅ 退款接口鉴权通过（微信已收到并校验了签名，只是订单不存在）——说明退款权限可用。");
} else if (res.status === 200) {
  console.log("\n⚠️ 竟然退款成功了，请立即核查商户平台！");
} else {
  console.log("\n⚠️ 返回了其他业务码，请人工判断（若为 NO_AUTH 说明未开通退款权限）。");
}
