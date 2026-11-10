import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";

/**
 * 微信支付 V3 回调链路隔离实测。
 *
 * 背景：审查发现「模拟回调绕过真实微信回调，核心付费链路从未穿过」（DEF-005）。
 * 真实商户投递无法在本地复现，但**验签 + AES-256-GCM 解密 + 金额提取**这段
 * 最有价值、最容易写错的逻辑完全可以离线实测：用自造密钥对模拟微信平台，
 * 产出与真实回调字节结构一致的报文，验证服务端能正确接受/拒绝。
 *
 * 全程不联网、不接触真实微信、不使用真实商户密钥。
 */

const API_V3_KEY = "0123456789abcdef0123456789abcdef"; // 32 字节，微信要求
const MCH_ID = "1900000001";
const APP_ID = "wxtest0000000001";
const PUBKEY_ID = "PUB_KEY_ID_TEST_0001";

let platformPriv = ""; // 模拟「微信平台私钥」：用于给回调签名
let platformPub = ""; // 模拟「微信支付公钥」：服务端用它验签
let merchantPriv = ""; // 模拟「商户私钥」：仅满足 wechatReady 前置条件，测试中不发起请求

let provider: any;

function encryptResource(plaintext: string, nonce: string, aad: string): string {
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    Buffer.from(API_V3_KEY, "utf8"),
    Buffer.from(nonce, "utf8")
  );
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // 微信格式：密文 + 16 字节 authTag，再整体 base64
  return Buffer.concat([enc, tag]).toString("base64");
}

type NotifyOptions = {
  outTradeNo?: string;
  transactionId?: string;
  totalFen?: number;
  tradeState?: string;
  /** 篡改：签名用原始 body，但实际发送被改过的 body */
  tamperBody?: boolean;
  /** 用错误的 APIv3Key 加密（模拟密钥不匹配） */
  wrongKey?: boolean;
};

function buildNotify(opts: NotifyOptions = {}) {
  const {
    outTradeNo = "o_test_0001",
    transactionId = "4200001234202601050000000001",
    totalFen = 3000,
    tradeState = "SUCCESS",
    tamperBody = false,
    wrongKey = false,
  } = opts;

  const nonce = "abcdef123456"; // 12 字节
  const aad = "transaction";
  const resourcePlain = JSON.stringify({
    mchid: MCH_ID,
    appid: APP_ID,
    out_trade_no: outTradeNo,
    transaction_id: transactionId,
    trade_type: "NATIVE",
    trade_state: tradeState,
    trade_state_desc: tradeState === "SUCCESS" ? "支付成功" : "未支付",
    success_time: "2026-11-05T23:00:00+08:00",
    payer: { openid: "oUpF8uMuAJO_M2pxb1Q9zNjWeS6o" },
    amount: { total: totalFen, payer_total: totalFen, currency: "CNY", payer_currency: "CNY" },
  });

  let ciphertext: string;
  if (wrongKey) {
    // 用另一把 key 加密：验签能过，但解密必然失败（authTag 校验不过）
    const wrong = crypto.randomBytes(16).toString("hex"); // 32 字符
    const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(wrong, "utf8"), Buffer.from(nonce, "utf8"));
    cipher.setAAD(Buffer.from(aad, "utf8"));
    const enc = Buffer.concat([cipher.update(resourcePlain, "utf8"), cipher.final()]);
    ciphertext = Buffer.concat([enc, cipher.getAuthTag()]).toString("base64");
  } else {
    ciphertext = encryptResource(resourcePlain, nonce, aad);
  }

  const body = JSON.stringify({
    id: "EV-20261105230000001",
    create_time: "2026-11-05T23:00:01+08:00",
    resource_type: "encrypt-resource",
    event_type: "TRANSACTION.SUCCESS",
    summary: "支付成功",
    resource: {
      original_type: "transaction",
      algorithm: "AEAD_AES_256_GCM",
      ciphertext,
      associated_data: aad,
      nonce,
    },
  });

  const timestamp = String(Math.floor(Date.now() / 1000));
  const headerNonce = "NONCE1234567890";
  const msg = `${timestamp}\n${headerNonce}\n${body}\n`;
  const signature = crypto.createSign("RSA-SHA256").update(msg, "utf8").sign(platformPriv, "base64");

  const sentBody = tamperBody ? body.replace("TRANSACTION.SUCCESS", "TRANSACTION.FAILED") : body;

  return {
    body: sentBody,
    headers: {
      "wechatpay-timestamp": timestamp,
      "wechatpay-nonce": headerNonce,
      "wechatpay-signature": signature,
      "wechatpay-serial": PUBKEY_ID,
    },
    signature,
  };
}

beforeAll(async () => {
  const platform = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  platformPriv = platform.privateKey;
  platformPub = platform.publicKey;

  const merchant = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  merchantPriv = merchant.privateKey;

  // 注入「看起来像生产」的微信配置（全部为测试自造值）
  process.env.PAY_PROVIDER = "wechat";
  process.env.WECHAT_PAY_MCH_ID = MCH_ID;
  process.env.WECHAT_PAY_APP_ID = APP_ID;
  process.env.WECHAT_PAY_API_V3_KEY = API_V3_KEY;
  process.env.WECHAT_PAY_SERIAL = "MERCHANT_SERIAL_TEST_0001";
  process.env.WECHAT_PAY_PRIVATE_KEY = merchantPriv;
  process.env.WECHAT_PAY_PUBKEY_ID = PUBKEY_ID;
  process.env.WECHAT_PAY_PUBKEY = platformPub;
  // 确保不会误用平台证书模式
  delete process.env.WECHAT_PAY_CERT;
  delete process.env.WECHAT_PAY_CERT_FILE;
  delete process.env.WECHAT_PAY_PUBKEY_FILE;

  const mod = await import("@/lib/payment");
  provider = mod.getPaymentProvider();
});

describe("微信 V3 回调：验签 + 解密 + 金额提取", () => {
  it("通道被正确识别为 wechat（生产链路而非 mock）", () => {
    expect(provider).not.toBeNull();
    expect(provider.name).toBe("wechat");
    expect(provider.verifyMode).toBe("pubkey");
  });

  it("合法回调：解开密文并取到订单号与实付金额", async () => {
    const { body, headers } = buildNotify({ outTradeNo: "o_paid_ok", totalFen: 2990 });
    const r = await provider.verifyCallback(body, headers);

    expect(r.outTradeNo).toBe("o_paid_ok");
    expect(r.tradeNo).toBe("4200001234202601050000000001");
    expect(r.paid).toBe(true);
    expect(r.amountFen).toBe(2990); // 关键：金额真实来自密文，不是外部传入
  });

  it("篡改外层报文 → 签名校验失败（金额本身在密文内，外层无可篡改的明文金额）", async () => {
    // 注意：实付金额只存在于 AES-GCM 密文里，外层 JSON 并没有明文 "total" 字段，
    // 所以「改金额」这种攻击必须伪造签名（没有平台私钥做不到）。这里改外层可见字段验证签名强校验。
    const { body, headers } = buildNotify({ tamperBody: true });
    expect(body).toContain("TRANSACTION.FAILED");
    await expect(provider.verifyCallback(body, headers)).rejects.toThrow(/签名校验失败/);
  });

  it("签名头缺失 → 明确拒绝", async () => {
    const { body } = buildNotify();
    await expect(provider.verifyCallback(body, {})).rejects.toThrow(/缺少签名头/);
  });

  it("用错误的 APIv3 Key 加密 → 解密失败（不会静默返回空对象）", async () => {
    const { body, headers } = buildNotify({ wrongKey: true });
    await expect(provider.verifyCallback(body, headers)).rejects.toThrow();
  });

  it("trade_state 非 SUCCESS → paid=false（未支付不得放行）", async () => {
    const { body, headers } = buildNotify({ tradeState: "NOTPAY" });
    const r = await provider.verifyCallback(body, headers);
    expect(r.paid).toBe(false);
  });

  it("金额字段缺失时 amountFen=0 —— 交由 markOrderPaid 拒绝置为已付", async () => {
    // 构造一个没有 amount 的密文，验证下游能拿到 0 而不是 undefined/NaN
    const nonce = "abcdef123456";
    const aad = "transaction";
    const plain = JSON.stringify({
      mchid: MCH_ID,
      appid: APP_ID,
      out_trade_no: "o_no_amount",
      transaction_id: "4200000000000000000000000002",
      trade_state: "SUCCESS",
    });
    const ciphertext = encryptResource(plain, nonce, aad);
    const body = JSON.stringify({
      id: "EV-2",
      event_type: "TRANSACTION.SUCCESS",
      resource: { algorithm: "AEAD_AES_256_GCM", ciphertext, associated_data: aad, nonce },
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const headerNonce = "NONCE0000000001";
    const signature = crypto
      .createSign("RSA-SHA256")
      .update(`${timestamp}\n${headerNonce}\n${body}\n`, "utf8")
      .sign(platformPriv, "base64");

    const r = await provider.verifyCallback(body, {
      "wechatpay-timestamp": timestamp,
      "wechatpay-nonce": headerNonce,
      "wechatpay-signature": signature,
      "wechatpay-serial": PUBKEY_ID,
    });
    expect(r.paid).toBe(true);
    expect(r.amountFen).toBe(0); // SEC-05：markOrderPaid 会因 amountFen<=0 拒绝
  });
});
