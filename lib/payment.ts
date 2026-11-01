// 真实支付通道：微信支付（Native 扫码 V3）+ 支付宝（当面付 precreate）+ 本地模拟（开发测试）。
// 仅服务端引用。密钥等敏感信息全部来自环境变量（Vercel 加密环境变量），不落库。
import crypto from "crypto";
import type { Order, OrderProvider, OrderStatus } from "@/lib/orders";

/* ----------------------------- 基础工具 ----------------------------- */

function normPem(raw: string | undefined, label: string): string {
  if (!raw) throw new Error(`缺少支付配置：${label}`);
  // 允许以字面 \n 存储的 PEM
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

/** RSA-SHA256 签名（微信 V3 / 支付宝 通用），返回 base64 */
function rsaSign(privatePem: string, msg: string): string {
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(msg, "utf8");
  return signer.sign(privatePem, "base64");
}

/** 验证 RSA 签名 */
function rsaVerify(publicPem: string, msg: string, sigBase64: string): boolean {
  try {
    const v = crypto.createVerify("RSA-SHA256");
    v.update(msg, "utf8");
    return v.verify(publicPem, sigBase64, "base64");
  } catch {
    return false;
  }
}

/** 微信 V3 回调报文 AES-256-GCM 解密 */
function wechatAesDecrypt(apiV3Key: string, nonce: string, associatedData: string, ciphertextB64: string): string {
  const buf = Buffer.from(ciphertextB64, "base64");
  const authTag = buf.subarray(buf.length - 16);
  const data = buf.subarray(0, buf.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(apiV3Key, "utf8"), Buffer.from(nonce, "utf8"));
  decipher.setAuthTag(authTag);
  if (associatedData) decipher.setAAD(Buffer.from(associatedData, "utf8"));
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}

/* ----------------------------- 通道接口 ----------------------------- */

export interface PaymentProvider {
  readonly name: OrderProvider;
  /** 创建扫码支付，返回原生二维码内容（codeUrl） */
  createNativePayment(order: Order, notifyBase: string): Promise<{ codeUrl: string }>;
  /** 校验并解析异步回调，返回订单号与支付结果 */
  verifyCallback(rawBody: string, headers: Record<string, string | undefined>): Promise<{
    outTradeNo: string;
    tradeNo: string;
    paid: boolean;
    amountFen: number;
  }>;
  /** 回调成功时返回的 HTTP 响应体（微信需 JSON，支付宝需纯文本 success） */
  successResponse(): { contentType: string; body: string };
}

/* ----------------------------- 微信支付 V3 ----------------------------- */

class WechatPayProvider implements PaymentProvider {
  readonly name = "wechat" as const;
  mchId = process.env.WECHAT_PAY_MCH_ID!;
  appId = process.env.WECHAT_PAY_APP_ID!;
  apiV3Key = process.env.WECHAT_PAY_API_V3_KEY!;
  serial = process.env.WECHAT_PAY_SERIAL!;
  privateKey = normPem(process.env.WECHAT_PAY_PRIVATE_KEY, "WECHAT_PAY_PRIVATE_KEY");
  platformCert = normPem(process.env.WECHAT_PAY_CERT, "WECHAT_PAY_CERT");
  private base = "https://api.mch.weixin.qq.com";

  private authHeader(method: string, urlPath: string, body: string): string {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomBytes(16).toString("hex");
    const msg = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${body}\n`;
    const signature = rsaSign(this.privateKey, msg);
    return `WECHATPAY2-SHA256-RSA2048 mchid="${this.mchId}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${this.serial}"`;
  }

  async createNativePayment(order: Order, notifyBase: string): Promise<{ codeUrl: string }> {
    const urlPath = "/v3/pay/transactions/native";
    const bodyObj = {
      appid: this.appId,
      mchid: this.mchId,
      description: order.productTitle.slice(0, 42) || "资源下载",
      out_trade_no: order.id,
      notify_url: `${notifyBase}/api/pay/callback/wechat`,
      amount: { total: order.amountFen, currency: "CNY" },
      time_expire: new Date(new Date(order.expiresAt).getTime() - 30_000).toISOString().replace(/\.\d{3}Z$/, "Z"),
    };
    const body = JSON.stringify(bodyObj);
    const res = await fetch(`${this.base}${urlPath}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: this.authHeader("POST", urlPath, body),
      },
      body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.code_url) {
      throw new Error(`微信下单失败：${data.code || res.status} ${data.message || ""}`);
    }
    return { codeUrl: data.code_url as string };
  }

  async verifyCallback(rawBody: string, headers: Record<string, string | undefined>): Promise<{
    outTradeNo: string; tradeNo: string; paid: boolean; amountFen: number;
  }> {
    const timestamp = headers["wechatpay-timestamp"];
    const nonce = headers["wechatpay-nonce"];
    const sig = headers["wechatpay-signature"];
    const serial = headers["wechatpay-serial"];
    if (!timestamp || !nonce || !sig) throw new Error("微信回调缺少签名头");
    // 平台证书序列号一致性校验（可选但推荐）
    if (serial && this.serial && serial !== this.serial) {
      // 证书可能轮换，这里仅记录；若你有多个平台证书可实现映射
    }
    const msg = `${timestamp}\n${nonce}\n${rawBody}\n`;
    if (!rsaVerify(this.platformCert, msg, sig)) throw new Error("微信回调签名校验失败");
    const payload = JSON.parse(rawBody);
    const resource = payload.resource || {};
    const plain = wechatAesDecrypt(this.apiV3Key, resource.nonce, resource.associated_data || "", resource.ciphertext);
    const data = JSON.parse(plain);
    return {
      outTradeNo: data.out_trade_no,
      tradeNo: data.transaction_id || "",
      paid: data.trade_state === "SUCCESS",
      amountFen: data.amount?.total || 0,
    };
  }

  /** 自检：调用微信「获取平台证书」接口，校验商户号/私钥/证书序列号是否可用 */
  async certCheck(): Promise<{ ok: boolean; httpStatus?: number; detail: string }> {
    const urlPath = "/v3/certificates";
    try {
      const res = await fetch(`${this.base}${urlPath}`, {
        method: "GET",
        headers: { Accept: "application/json", Authorization: this.authHeader("GET", urlPath, "") },
      });
      const text = await res.text();
      if (!res.ok) return { ok: false, httpStatus: res.status, detail: text.slice(0, 400) };
      return { ok: true, httpStatus: res.status, detail: "平台证书接口调通：商户号 / API 私钥 / 证书序列号校验通过 ✅" };
    } catch (e: any) {
      return { ok: false, detail: e.message || "请求微信接口失败" };
    }
  }

  successResponse() {
    return { contentType: "application/json", body: JSON.stringify({ code: "SUCCESS", message: "成功" }) };
  }
}

/* ----------------------------- 支付宝 当面付 ----------------------------- */

class AlipayProvider implements PaymentProvider {
  readonly name = "alipay" as const;
  appId = process.env.ALIPAY_APP_ID!;
  privateKey = normPem(process.env.ALIPAY_PRIVATE_KEY, "ALIPAY_PRIVATE_KEY");
  alipayPublicKey = normPem(process.env.ALIPAY_PUBLIC_KEY, "ALIPAY_PUBLIC_KEY");
  private gateway = process.env.ALIPAY_GATEWAY || "https://openapi.alipay.com/gateway.do";

  private signParams(params: Record<string, string>): string {
    const sorted = Object.keys(params).filter((k) => k !== "sign" && params[k] !== "" && params[k] != null)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join("&");
    return rsaSign(this.privateKey, sorted);
  }

  async createNativePayment(order: Order, notifyBase: string): Promise<{ codeUrl: string }> {
    const biz = JSON.stringify({
      out_trade_no: order.id,
      total_amount: order.amount.toFixed(2),
      subject: order.productTitle.slice(0, 64) || "资源下载",
      notify_url: `${notifyBase}/api/pay/callback/alipay`,
    });
    const params: Record<string, string> = {
      app_id: this.appId,
      method: "alipay.trade.precreate",
      format: "JSON",
      charset: "utf-8",
      sign_type: "RSA2",
      timestamp: (() => {
        const d = new Date();
        const p = (n: number) => String(n).padStart(2, "0");
        return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
      })(),
      version: "1.0",
      biz_content: biz,
    };
    params.sign = this.signParams(params);
    const form = new URLSearchParams(params).toString();
    const res = await fetch(this.gateway, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" }, body: form });
    const text = await res.text();
    const json = JSON.parse(text);
    const r = json.alipay_trade_precreate_response;
    if (!r || r.code !== "10000" || !r.qr_code) {
      throw new Error(`支付宝下单失败：${r?.sub_code || r?.code || res.status} ${r?.sub_msg || ""}`);
    }
    return { codeUrl: r.qr_code as string };
  }

  async verifyCallback(rawBody: string, _headers: Record<string, string | undefined>): Promise<{
    outTradeNo: string; tradeNo: string; paid: boolean; amountFen: number;
  }> {
    // 支付宝异步通知为 form 表单（application/x-www-form-urlencoded）
    const params = Object.fromEntries(new URLSearchParams(rawBody)) as Record<string, string>;
    const sign = params.sign;
    if (!sign) throw new Error("支付宝回调缺少签名");
    const calcSign = this.signParams(params);
    if (calcSign !== sign) throw new Error("支付宝回调签名校验失败");
    const paid = params.trade_status === "TRADE_SUCCESS" || params.trade_status === "TRADE_FINISHED";
    return {
      outTradeNo: params.out_trade_no,
      tradeNo: params.trade_no || "",
      paid,
      amountFen: Math.round(Number(params.total_amount || 0) * 100),
    };
  }

  successResponse() {
    return { contentType: "text/plain;charset=utf-8", body: "success" };
  }
}

/* ----------------------------- 本地模拟（开发/测试） ----------------------------- */

class MockProvider implements PaymentProvider {
  readonly name = "mock" as const;
  async createNativePayment(order: Order): Promise<{ codeUrl: string }> {
    // 生成一个可被本站点“模拟支付”接口识别的伪二维码内容
    return { codeUrl: `mockpay://${order.id}` };
  }
  async verifyCallback(rawBody: string): Promise<{ outTradeNo: string; tradeNo: string; paid: boolean; amountFen: number }> {
    const p = JSON.parse(rawBody || "{}");
    return { outTradeNo: p.outTradeNo, tradeNo: p.tradeNo || "MOCK" + Date.now(), paid: true, amountFen: p.amountFen || 0 };
  }
  successResponse() {
    return { contentType: "application/json", body: JSON.stringify({ ok: true }) };
  }
}

/* ----------------------------- 工厂 ----------------------------- */

export function getPaymentProvider(): PaymentProvider | null {
  const mode = (process.env.PAY_PROVIDER || "").toLowerCase();
  if (mode === "wechat") {
    try {
      const p = new WechatPayProvider();
      if (p.mchId && p.appId && p.apiV3Key && p.serial && p.privateKey && p.platformCert) return p;
    } catch {
      return null;
    }
    return null;
  }
  if (mode === "alipay") {
    try {
      const p = new AlipayProvider();
      if (p.appId && p.privateKey && p.alipayPublicKey) return p;
    } catch {
      return null;
    }
    return null;
  }
  if (mode === "mock") return new MockProvider();
  // 未显式配置：若已具备微信/支付宝凭据则自动启用其一
  try {
    const w = new WechatPayProvider();
    if (w.mchId && w.appId && w.apiV3Key && w.serial && w.privateKey && w.platformCert) return w;
  } catch {}
  try {
    const a = new AlipayProvider();
    if (a.appId && a.privateKey && a.alipayPublicKey) return a;
  } catch {}
  return null;
}

/**
 * 支付配置自检：返回缺失的配置项名称（不返回任何密钥内容）+ 微信接口连通性测试结果。
 * 便于管理员自行排查凭据是否配置正确。
 */
export async function selfCheck(): Promise<{
  provider: OrderProvider | null;
  missing: string[];
  apiTest?: { ok: boolean; httpStatus?: number; detail: string };
  notifyBase?: string;
}> {
  const st = paymentStatus();
  const mode = (process.env.PAY_PROVIDER || "").toLowerCase();
  const missing: string[] = [];
  const wantWechat = mode === "wechat" || (!mode && st.wechat);
  const wantAlipay = mode === "alipay" || (!mode && st.alipay);
  if (wantWechat)
    for (const k of ["WECHAT_PAY_MCH_ID", "WECHAT_PAY_APP_ID", "WECHAT_PAY_API_V3_KEY", "WECHAT_PAY_SERIAL", "WECHAT_PAY_PRIVATE_KEY", "WECHAT_PAY_CERT"])
      if (!process.env[k]) missing.push(k);
  if (wantAlipay)
    for (const k of ["ALIPAY_APP_ID", "ALIPAY_PRIVATE_KEY", "ALIPAY_PUBLIC_KEY"])
      if (!process.env[k]) missing.push(k);

  let apiTest: { ok: boolean; httpStatus?: number; detail: string } | undefined;
  if (st.provider === "wechat" && missing.length === 0) {
    try {
      apiTest = await new WechatPayProvider().certCheck();
    } catch (e: any) {
      apiTest = { ok: false, detail: e.message || "初始化失败" };
    }
  }
  return {
    provider: st.provider,
    missing,
    apiTest,
    notifyBase: process.env.PAY_NOTIFY_BASE || "(未设置，按请求 origin 推导)",
  };
}

/** 返回已配置通道的概览（不含密钥），供后台展示状态 */
export function paymentStatus(): { provider: OrderProvider | null; wechat: boolean; alipay: boolean; mock: boolean } {
  const hasW = !!(process.env.WECHAT_PAY_MCH_ID && process.env.WECHAT_PAY_APP_ID && process.env.WECHAT_PAY_API_V3_KEY && process.env.WECHAT_PAY_SERIAL && process.env.WECHAT_PAY_PRIVATE_KEY && process.env.WECHAT_PAY_CERT);
  const hasA = !!(process.env.ALIPAY_APP_ID && process.env.ALIPAY_PRIVATE_KEY && process.env.ALIPAY_PUBLIC_KEY);
  const mode = (process.env.PAY_PROVIDER || "").toLowerCase();
  let provider: OrderProvider | null = null;
  if (mode === "wechat" && hasW) provider = "wechat";
  else if (mode === "alipay" && hasA) provider = "alipay";
  else if (mode === "mock") provider = "mock";
  else if (hasW) provider = "wechat";
  else if (hasA) provider = "alipay";
  return { provider, wechat: hasW, alipay: hasA, mock: mode === "mock" };
}
