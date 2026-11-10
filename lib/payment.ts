// 真实支付通道：微信支付（Native 扫码 V3）+ 支付宝（当面付 precreate）+ 本地模拟（开发测试）。
// 仅服务端引用。密钥等敏感信息全部来自环境变量（Vercel 加密环境变量），不落库。
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fetchWithTimeout, withRetry } from "@/lib/http";
import type { Order, OrderProvider, OrderStatus } from "@/lib/orders";

/* ----------------------------- 基础工具 ----------------------------- */

function normPem(raw: string | undefined, label: string): string {
  if (!raw) throw new Error(`缺少支付配置：${label}`);
  // 允许以字面 \n 存储的 PEM
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

/**
 * 解析 PEM 凭据：优先读文件，其次取环境变量值。
 * 多行 PEM 塞进环境变量易在复制粘贴中损坏（换行丢失），故同时支持文件方式：
 *   WECHAT_PAY_PRIVATE_KEY_FILE=credentials/apiclient_key.pem
 * 路径支持绝对路径，或相对进程工作目录（standalone 下为 /app）。
 */
function resolvePemFile(fileEnv: string): string {
  const file = process.env[fileEnv];
  if (!file) return "";
  try {
    const p = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
    return fs.readFileSync(p, "utf8").trim();
  } catch {
    return "";
  }
}

function resolvePem(valueEnv: string, fileEnv: string): string {
  return resolvePemFile(fileEnv) || pemOpt(process.env[valueEnv]);
}

/** 判断某个 PEM 凭据是否已提供（环境变量或文件任一存在） */
function hasPem(valueEnv: string, fileEnv: string): boolean {
  return !!(process.env[valueEnv] || resolvePemFile(fileEnv));
}

/** 可选 PEM：缺失返回空串（用于「两种验签模式二选一」的场景），格式同 normPem */
function pemOpt(raw: string | undefined): string {
  if (!raw) return "";
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

/**
 * 判断微信凭据是否已满足可用条件。
 * 验签凭据二选一即可：
 *  - 平台证书模式： WECHAT_PAY_CERT（需用微信官方证书下载工具获取，且证书会轮换）
 *  - 微信支付公钥模式：WECHAT_PAY_PUBKEY_ID + WECHAT_PAY_PUBKEY（商户平台可直接复制，推荐）
 */
function wechatReady(env: NodeJS.ProcessEnv = process.env): "pubkey" | "cert" | null {
  const base = !!(env.WECHAT_PAY_MCH_ID && env.WECHAT_PAY_APP_ID && env.WECHAT_PAY_API_V3_KEY && env.WECHAT_PAY_SERIAL && hasPem("WECHAT_PAY_PRIVATE_KEY", "WECHAT_PAY_PRIVATE_KEY_FILE"));
  if (!base) return null;
  if (env.WECHAT_PAY_PUBKEY_ID && hasPem("WECHAT_PAY_PUBKEY", "WECHAT_PAY_PUBKEY_FILE")) return "pubkey";
  if (hasPem("WECHAT_PAY_CERT", "WECHAT_PAY_CERT_FILE")) return "cert";
  return null;
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
  /** 主动查单：以网关状态为准（回调丢失时用于兜底核对） */
  queryOrder?(outTradeNo: string): Promise<{
    found: boolean;
    paid: boolean;
    tradeNo?: string;
    amountFen?: number;
    state?: string;
    paidAt?: string;
  }>;
  /** 申请退款（微信 V3 退款）；返回网关受理状态 */
  refund?(params: {
    outTradeNo: string;
    outRefundNo: string;
    totalFen: number;
    refundFen: number;
    reason?: string;
    notifyBase?: string;
  }): Promise<{ status: string; gatewayRefundId?: string; amountFen: number; failReason?: string }>;
  /** 通用通知校验（验签 + 解密），退款回调等场景使用 */
  verifyNotify?(rawBody: string, headers: Record<string, string | undefined>): Promise<Record<string, any>>;
  /**
   * 查询退款结果。第二个参数传商户订单号：微信不需要（忽略），
   * 支付宝 alipay.trade.fastpay.refund.query 同时传 out_trade_no + out_request_no 更稳妥。
   */
  queryRefund?(outRefundNo: string, outTradeNo?: string): Promise<{
    status: string;
    gatewayRefundId?: string;
    amountFen?: number;
    successTime?: string;
    failReason?: string;
  }>;
}

/* ----------------------------- 微信支付 V3 ----------------------------- */

class WechatPayProvider implements PaymentProvider {
  readonly name = "wechat" as const;
  mchId = process.env.WECHAT_PAY_MCH_ID!;
  appId = process.env.WECHAT_PAY_APP_ID!;
  apiV3Key = process.env.WECHAT_PAY_API_V3_KEY!;
  serial = process.env.WECHAT_PAY_SERIAL!;
  privateKey = resolvePem("WECHAT_PAY_PRIVATE_KEY", "WECHAT_PAY_PRIVATE_KEY_FILE");
  platformCert = resolvePem("WECHAT_PAY_CERT", "WECHAT_PAY_CERT_FILE");
  /** 微信支付公钥模式（免平台证书）：公钥 ID + 公钥 PEM */
  pubkeyId = process.env.WECHAT_PAY_PUBKEY_ID || "";
  pubkey = resolvePem("WECHAT_PAY_PUBKEY", "WECHAT_PAY_PUBKEY_FILE");
  private base = "https://api.mch.weixin.qq.com";

  /** 当前验签模式：公钥模式优先（配置更简单、无证书轮换问题） */
  get verifyMode(): "pubkey" | "cert" {
    return this.pubkey ? "pubkey" : "cert";
  }

  /** 回调验签用的公钥凭据（公钥模式下为微信支付公钥，否则为平台证书） */
  get verifyKey(): string {
    return this.pubkey || this.platformCert;
  }

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
    const res = await fetchWithTimeout(`${this.base}${urlPath}`, {
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

  /**
   * 通用通知校验：验签（公钥/平台证书）+ AES-GCM 解密，返回解密后的业务对象。
   * 支付回调、退款回调共用。
   */
  async verifyNotify(rawBody: string, headers: Record<string, string | undefined>): Promise<Record<string, any>> {
    const timestamp = headers["wechatpay-timestamp"];
    const nonce = headers["wechatpay-nonce"];
    const sig = headers["wechatpay-signature"];
    const serial = headers["wechatpay-serial"];
    if (!timestamp || !nonce || !sig) throw new Error("微信回调缺少签名头");
    // 平台证书/公钥序列号一致性校验（仅记录，避免微信轮换时误杀）
    if (this.verifyMode === "pubkey") {
      if (serial && this.pubkeyId && serial !== this.pubkeyId) {
        console.warn(`[pay] 回调 Wechatpay-Serial 与 WECHAT_PAY_PUBKEY_ID 不一致(${serial})，可能因公钥轮换，继续按当前公钥验签`);
      }
    } else if (serial && this.serial && serial !== this.serial) {
      console.warn(`[pay] 回调 Wechatpay-Serial 与商户证书序列号不一致(${serial})，可能因平台证书轮换`);
    }
    const msg = `${timestamp}\n${nonce}\n${rawBody}\n`;
    if (!this.verifyKey) throw new Error("缺少微信验签凭据（WECHAT_PAY_PUBKEY 或 WECHAT_PAY_CERT）");
    if (!rsaVerify(this.verifyKey, msg, sig)) throw new Error("微信回调签名校验失败");
    const payload = JSON.parse(rawBody);
    const resource = payload.resource || {};
    const plain = wechatAesDecrypt(this.apiV3Key, resource.nonce, resource.associated_data || "", resource.ciphertext);
    return JSON.parse(plain);
  }

  async verifyCallback(rawBody: string, headers: Record<string, string | undefined>): Promise<{
    outTradeNo: string; tradeNo: string; paid: boolean; amountFen: number;
  }> {
    const data = await this.verifyNotify(rawBody, headers);
    return {
      outTradeNo: data.out_trade_no,
      tradeNo: data.transaction_id || "",
      paid: data.trade_state === "SUCCESS",
      amountFen: data.amount?.total || 0,
    };
  }

  /** 主动查单：GET /v3/pay/transactions/out-trade-no/{out_trade_no} */
  async queryOrder(outTradeNo: string): Promise<{
    found: boolean; paid: boolean; tradeNo?: string; amountFen?: number; state?: string; paidAt?: string;
  }> {
    const urlPath = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}?mchid=${this.mchId}`;
    const res = await withRetry(() =>
      fetchWithTimeout(`${this.base}${urlPath}`, {
        method: "GET",
        headers: { Accept: "application/json", "Accept-Language": "zh-CN", "User-Agent": "xm-portal/1.0", Authorization: this.authHeader("GET", urlPath, "") },
      }),
    );
    if (res.status === 404) return { found: false, paid: false };
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`微信查单失败：${data.code || res.status} ${data.message || ""}`);
    const amount = data.amount || {};
    return {
      found: true,
      paid: data.trade_state === "SUCCESS",
      tradeNo: data.transaction_id,
      amountFen: amount.total,
      state: data.trade_state,
      paidAt: data.success_time,
    };
  }

  /** 申请退款：POST /v3/refund/domestic/refunds */
  async refund(params: {
    outTradeNo: string; outRefundNo: string; totalFen: number; refundFen: number; reason?: string; notifyBase?: string;
  }): Promise<{ status: string; gatewayRefundId?: string; amountFen: number; failReason?: string }> {
    const urlPath = "/v3/refund/domestic/refunds";
    const bodyObj: Record<string, unknown> = {
      out_trade_no: params.outTradeNo,
      out_refund_no: params.outRefundNo,
      reason: (params.reason || "用户申请退款").slice(0, 60),
      amount: {
        refund: params.refundFen,
        total: params.totalFen,
        currency: "CNY",
      },
    };
    if (params.notifyBase) bodyObj.notify_url = `${params.notifyBase}/api/pay/refund/wechat`;
    const body = JSON.stringify(bodyObj);
    const res = await fetchWithTimeout(`${this.base}${urlPath}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Accept-Language": "zh-CN",
        "User-Agent": "xm-portal/1.0",
        Authorization: this.authHeader("POST", urlPath, body),
      },
      body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.status) {
      throw new Error(`微信退款失败：${data.code || res.status} ${data.message || ""}`);
    }
    const amount = data.amount || {};
    return {
      status: String(data.status),
      gatewayRefundId: data.refund_id,
      amountFen: amount.refund || params.refundFen,
      failReason: data.fail_reason || data.reason || undefined,
    };
  }

  /**
   * 查询退款：GET /v3/refund/domestic/refunds/{out_refund_no}
   * 注意：该接口不接受 mchid 查询参数（商户号由 Authorization 头识别），
   * 带上会报 PARAM_ERROR「/query/mchid 未在API文档中定义」。
   */
  async queryRefund(outRefundNo: string, _outTradeNo?: string): Promise<{
    status: string; gatewayRefundId?: string; amountFen?: number; successTime?: string; failReason?: string;
  }> {
    const urlPath = `/v3/refund/domestic/refunds/${encodeURIComponent(outRefundNo)}`;
    const res = await withRetry(() =>
      fetchWithTimeout(`${this.base}${urlPath}`, {
        method: "GET",
        headers: { Accept: "application/json", "Accept-Language": "zh-CN", "User-Agent": "xm-portal/1.0", Authorization: this.authHeader("GET", urlPath, "") },
      }),
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.status) {
      throw new Error(`微信退款查询失败：${data.code || res.status} ${data.message || ""}`);
    }
    const amount = data.amount || {};
    return {
      status: String(data.status),
      gatewayRefundId: data.refund_id,
      amountFen: amount.refund,
      successTime: data.success_time,
      failReason: data.fail_reason || data.reason || undefined,
    };
  }

  /** 自检：调用微信「获取平台证书」接口，校验商户号/私钥/证书序列号是否可用 */
  async certCheck(): Promise<{ ok: boolean; httpStatus?: number; detail: string }> {
    const urlPath = "/v3/certificates";
    try {
      const res = await withRetry(() =>
        fetchWithTimeout(`${this.base}${urlPath}`, {
          method: "GET",
          headers: { Accept: "application/json", "Accept-Language": "zh-CN", "User-Agent": "xm-portal/1.0", Authorization: this.authHeader("GET", urlPath, "") },
        }),
      );
      const text = await res.text();
      if (res.status === 200) return { ok: true, httpStatus: 200, detail: "平台证书接口调通：商户号 / API 私钥 / 证书序列号校验通过 ✅" };
      // 401 才是签名/凭据问题；其余业务码说明请求已通过鉴权到达业务层
      if (res.status === 401) return { ok: false, httpStatus: 401, detail: `❌ 凭据校验失败（SIGN_ERROR）：商户号 / API 私钥 / 证书序列号不配套。${text.slice(0, 200)}` };
      if (text.includes("RESOURCE_NOT_EXISTS"))
        return {
          ok: true,
          httpStatus: res.status,
          detail:
            this.verifyMode === "pubkey"
              ? "✅ 凭据校验通过（已走到微信业务层）。本商户号使用「微信支付公钥」模式，本就没有平台证书，接口返回 404 属正常现象，无需处理。"
              : "✅ 凭据校验通过（已走到微信业务层），但本商户号没有可用的平台证书，须改用「微信支付公钥」验签：商户平台 → 账户中心 → API安全 → 申请/管理公钥，配置 WECHAT_PAY_PUBKEY_ID + WECHAT_PAY_PUBKEY（或 WECHAT_PAY_PUBKEY_FILE）。",
        };
      return { ok: true, httpStatus: res.status, detail: `✅ 凭据校验通过（已走到微信业务层，返回业务码 ${res.status}）。${text.slice(0, 200)}` };
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

  /**
   * 支付宝待签名串：按参数名 ASCII 字典序拼接 k=v（原始值，不做 URL 编码）。
   * 必须排除 sign 与 sign_type —— 支付宝网关计算签名时同样排除这两个字段。
   * 旧实现把 sign_type 算了进去，导致连「下单请求签名」都不匹配；
   * 回调更是用商户私钥重签去比对支付宝的 sign，方向完全错误（签名方是支付宝）。
   */
  private signableContent(params: Record<string, string>): string {
    return Object.keys(params)
      .filter((k) => k !== "sign" && k !== "sign_type" && params[k] !== "" && params[k] != null)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join("&");
  }

  /** 用「商户应用私钥」对请求参数签名（RSA2 / SHA256） */
  private signParams(params: Record<string, string>): string {
    return rsaSign(this.privateKey, this.signableContent(params));
  }

  private timestamp(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
  }

  /**
   * 统一调用支付宝开放平台网关，返回「<method 下划线形式>_response」业务节点。
   * 说明：响应签名校验需保留原始 JSON 片段重新提取，支付宝网关走 HTTPS 且请求已签名，
   * 此处以业务 code/sub_code 判定结果；如需更高安全等级可再补 checkResponseSign。
   */
  private async callAlipay(method: string, bizContent: Record<string, unknown>): Promise<Record<string, any>> {
    const params: Record<string, string> = {
      app_id: this.appId,
      method,
      format: "JSON",
      charset: "utf-8",
      sign_type: "RSA2",
      timestamp: this.timestamp(),
      version: "1.0",
      biz_content: JSON.stringify(bizContent),
    };
    params.sign = this.signParams(params);
    const res = await fetchWithTimeout(this.gateway, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
      body: new URLSearchParams(params).toString(),
    });
    const text = await res.text();
    let json: Record<string, any>;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`支付宝网关返回非 JSON（HTTP ${res.status}）：${text.slice(0, 120)}`);
    }
    const nodeKey = method.replace(/\./g, "_") + "_response";
    const node = json[nodeKey] as Record<string, any> | undefined;
    if (!node || !node.code) {
      throw new Error(`支付宝响应缺少 ${nodeKey} 节点（HTTP ${res.status}）：${text.slice(0, 200)}`);
    }
    return node;
  }

  async createNativePayment(order: Order, notifyBase: string): Promise<{ codeUrl: string }> {
    const r = await this.callAlipay("alipay.trade.precreate", {
      out_trade_no: order.id,
      total_amount: order.amount.toFixed(2),
      subject: order.productTitle.slice(0, 64) || "资源下载",
      notify_url: `${notifyBase}/api/pay/callback/alipay`,
    });
    if (r.code !== "10000" || !r.qr_code) {
      throw new Error(`支付宝下单失败：${r.sub_code || r.code} ${r.sub_msg || ""}`);
    }
    return { codeUrl: String(r.qr_code) };
  }

  async verifyCallback(rawBody: string, _headers: Record<string, string | undefined>): Promise<{
    outTradeNo: string; tradeNo: string; paid: boolean; amountFen: number;
  }> {
    // 支付宝异步通知为 form 表单（application/x-www-form-urlencoded），URLSearchParams 会自动解码。
    const params = Object.fromEntries(new URLSearchParams(rawBody)) as Record<string, string>;
    const sign = params.sign;
    if (!sign) throw new Error("支付宝回调缺少签名");
    // 验签必须用「支付宝公钥」验证支付宝发来的签名，而不是用商户私钥重签比对。
    if (!rsaVerify(this.alipayPublicKey, this.signableContent(params), sign)) {
      throw new Error("支付宝回调签名校验失败");
    }
    const paid = params.trade_status === "TRADE_SUCCESS" || params.trade_status === "TRADE_FINISHED";
    return {
      outTradeNo: params.out_trade_no,
      tradeNo: params.trade_no || "",
      paid,
      amountFen: Math.round(Number(params.total_amount || params.total_fee || 0) * 100),
    };
  }

  /** 主动查单：alipay.trade.query（回调丢失时以网关状态为准） */
  async queryOrder(outTradeNo: string): Promise<{
    found: boolean; paid: boolean; tradeNo?: string; amountFen?: number; state?: string; paidAt?: string;
  }> {
    const r = await this.callAlipay("alipay.trade.query", { out_trade_no: outTradeNo });
    if (r.code === "40004" || r.sub_code === "ACQ.TRADE_NOT_EXIST") {
      return { found: false, paid: false };
    }
    if (r.code !== "10000") {
      throw new Error(`支付宝查单失败：${r.sub_code || r.code} ${r.sub_msg || ""}`);
    }
    const state = String(r.trade_status || "");
    return {
      found: true,
      paid: state === "TRADE_SUCCESS" || state === "TRADE_FINISHED",
      tradeNo: r.trade_no,
      amountFen: Math.round(Number(r.total_amount || 0) * 100),
      state,
      paidAt: r.send_pay_date || r.gmt_payment,
    };
  }

  /**
   * 申请退款：alipay.trade.refund。
   * 支付宝退款为同步返回结果，没有逐笔 notify_url（故忽略 params.notifyBase），
   * 也没有微信那样的异步退款通知 —— 终态以本次返回 + queryRefund 主动回查为准。
   */
  async refund(params: {
    outTradeNo: string; outRefundNo: string; totalFen: number; refundFen: number; reason?: string; notifyBase?: string;
  }): Promise<{ status: string; gatewayRefundId?: string; amountFen: number; failReason?: string }> {
    const r = await this.callAlipay("alipay.trade.refund", {
      out_trade_no: params.outTradeNo,
      out_request_no: params.outRefundNo,
      refund_amount: (params.refundFen / 100).toFixed(2),
      refund_reason: (params.reason || "用户申请退款").slice(0, 100),
    });
    if (r.code !== "10000") {
      throw new Error(`支付宝退款失败：${r.sub_code || r.code} ${r.sub_msg || ""}`);
    }
    // fund_change=Y 表示本次发生了资金变动（退款已成功）；N 多为重复请求，交给回查确认。
    return {
      status: r.fund_change === "Y" ? "SUCCESS" : "PROCESSING",
      gatewayRefundId: r.trade_no,
      amountFen: Math.round(Number(r.refund_fee || 0) * 100) || params.refundFen,
      failReason: r.sub_msg,
    };
  }

  /** 查询退款：alipay.trade.fastpay.refund.query */
  async queryRefund(outRefundNo: string, outTradeNo?: string): Promise<{
    status: string; gatewayRefundId?: string; amountFen?: number; successTime?: string; failReason?: string;
  }> {
    const biz: Record<string, unknown> = { out_request_no: outRefundNo };
    if (outTradeNo) biz.out_trade_no = outTradeNo;
    const r = await this.callAlipay("alipay.trade.fastpay.refund.query", biz);
    if (r.code !== "10000") {
      throw new Error(`支付宝退款查询失败：${r.sub_code || r.code} ${r.sub_msg || ""}`);
    }
    const s = String(r.refund_status || "");
    return {
      status: s === "REFUND_SUCCESS" ? "SUCCESS" : s === "REFUND_CLOSED" ? "CLOSED" : "PROCESSING",
      gatewayRefundId: r.trade_no,
      amountFen: Math.round(Number(r.refund_amount || 0) * 100) || undefined,
      successTime: r.gmt_refund_pay,
      failReason: r.sub_msg,
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
    const p = new WechatPayProvider();
    if (p.mchId && p.appId && p.apiV3Key && p.serial && p.privateKey && p.verifyKey) return p;
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
  const w = new WechatPayProvider();
  if (w.mchId && w.appId && w.apiV3Key && w.serial && w.privateKey && w.verifyKey) return w;
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
  if (wantWechat) {
    for (const k of ["WECHAT_PAY_MCH_ID", "WECHAT_PAY_APP_ID", "WECHAT_PAY_API_V3_KEY", "WECHAT_PAY_SERIAL"])
      if (!process.env[k]) missing.push(k);
    if (!hasPem("WECHAT_PAY_PRIVATE_KEY", "WECHAT_PAY_PRIVATE_KEY_FILE"))
      missing.push("WECHAT_PAY_PRIVATE_KEY（或 WECHAT_PAY_PRIVATE_KEY_FILE）");
    // 验签凭据二选一：微信支付公钥（推荐）或平台证书
    const hasPubkeyId = !!process.env.WECHAT_PAY_PUBKEY_ID;
    const hasPubkeyPem = hasPem("WECHAT_PAY_PUBKEY", "WECHAT_PAY_PUBKEY_FILE");
    const hasCert = hasPem("WECHAT_PAY_CERT", "WECHAT_PAY_CERT_FILE");
    if (!hasPubkeyId && !hasPubkeyPem && !hasCert)
      missing.push("WECHAT_PAY_PUBKEY_ID + WECHAT_PAY_PUBKEY（推荐，二选一）或 WECHAT_PAY_CERT");
    else {
      if (hasPubkeyId && !hasPubkeyPem) missing.push("WECHAT_PAY_PUBKEY（公钥内容，已配置了 PUBKEY_ID）");
      if (!hasPubkeyId && hasPubkeyPem) missing.push("WECHAT_PAY_PUBKEY_ID（已配置了公钥内容，缺 ID）");
    }
  }
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
export function paymentStatus(): {
  provider: OrderProvider | null;
  wechat: boolean;
  alipay: boolean;
  mock: boolean;
  /** 微信验签模式：pubkey=微信支付公钥模式，cert=平台证书模式 */
  wechatMode?: "pubkey" | "cert";
} {
  const wMode = wechatReady();
  const hasW = wMode !== null;
  const hasA = !!(process.env.ALIPAY_APP_ID && process.env.ALIPAY_PRIVATE_KEY && process.env.ALIPAY_PUBLIC_KEY);
  const mode = (process.env.PAY_PROVIDER || "").toLowerCase();
  let provider: OrderProvider | null = null;
  if (mode === "wechat" && hasW) provider = "wechat";
  else if (mode === "alipay" && hasA) provider = "alipay";
  else if (mode === "mock") provider = "mock";
  else if (hasW) provider = "wechat";
  else if (hasA) provider = "alipay";
  return { provider, wechat: hasW, alipay: hasA, mock: mode === "mock", wechatMode: wMode || undefined };
}
