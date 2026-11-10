import crypto from "node:crypto";

/**
 * 微信公众号（订阅号/服务号）服务器对接工具。
 *
 * 被动消息回复，不依赖任何第三方 SDK，支持明文模式 / 兼容模式 / 安全模式：
 *  - 服务器地址校验（GET，signature + echostr；安全模式下解密 echostr）
 *  - 明文与安全模式（EncodingAESKey / AES-256-CBC）消息解析与加密回复
 *  - msg_signature 校验（安全模式）
 *  - 文本消息被动回复（XML）
 *
 * 安全模式需在公众号后台生成 EncodingAESKey，并配置 WECHAT_MP_AESKEY。
 */

export type MpConfig = {
  token: string;
  appId: string;
  appSecret: string;
  /** 管理员预设的默认查询码：家长只发姓名也能查（可选） */
  defaultCode: string;
  /** 消息加解密密钥（43 位 base64 字符串，安全模式必填） */
  encodingAESKey: string;
};

export function mpConfig(env = process.env): MpConfig {
  return {
    token: (env.WECHAT_MP_TOKEN || "").trim(),
    appId: (env.WECHAT_MP_APPID || "").trim(),
    appSecret: (env.WECHAT_MP_APPSECRET || "").trim(),
    defaultCode: (env.WECHAT_MP_DEFAULT_CODE || "").trim().toUpperCase(),
    encodingAESKey: (env.WECHAT_MP_AESKEY || "").trim(),
  };
}

/** 站点对外地址（HELP 文案与菜单链接用，避免把域名写死在源码里） */
export function mpSiteUrl(env = process.env): string {
  const base = (env.PAY_NOTIFY_BASE || env.NEXT_PUBLIC_SITE_URL || "").trim();
  return (base || "https://www.cnxhy.top").replace(/\/+$/, "");
}

export function mpReady(cfg = mpConfig()): boolean {
  return !!cfg.token && !!cfg.appId;
}

/** 校验微信服务器签名：token/timestamp/nonce 字典序排序后 sha1 */
export function checkSignature(
  token: string,
  signature: string,
  timestamp: string,
  nonce: string
): boolean {
  if (!token || !signature) return false;
  const raw = [token, timestamp || "", nonce || ""].sort().join("");
  const sha = crypto.createHash("sha1").update(raw, "utf8").digest("hex");
  return sha === signature;
}

/* ---------- XML 解析（够用即可，避免引入依赖） ---------- */

/** 取出 <Tag><![CDATA[xxx]]></Tag> 或 <Tag>xxx</Tag> 的内容 */
function pick(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  if (!m) return "";
  let v = m[1];
  const cd = v.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  if (cd) v = cd[1];
  return v.trim();
}

export type MpMessage = {
  toUserName: string;
  fromUserName: string; // 发送方 openid
  createTime: string;
  msgType: string;
  content: string; // text 消息内容
  event: string; // event 消息的事件类型
  eventKey: string;
};

export function parseXml(xml: string): MpMessage {
  return {
    toUserName: pick(xml, "ToUserName"),
    fromUserName: pick(xml, "FromUserName"),
    createTime: pick(xml, "CreateTime"),
    msgType: (pick(xml, "MsgType") || "").toLowerCase(),
    content: pick(xml, "Content"),
    event: pick(xml, "Event"),
    eventKey: pick(xml, "EventKey"),
  };
}

/** 转义 XML 特殊字符（回复内容由用户输入拼接，必须转义） */
function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** 构造被动回复的文本消息 XML */
export function textReply(to: string, from: string, content: string): string {
  return `<xml><ToUserName><![CDATA[${esc(to)}]]></ToUserName><FromUserName><![CDATA[${esc(from)}]]></FromUserName><CreateTime>${Math.floor(
    Date.now() / 1000
  )}</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[${esc(content)}]]></Content></xml>`;
}

/* ==================== 安全模式（消息加解密） ==================== */

function sha1Sorted(parts: string[]): string {
  return crypto.createHash("sha1").update([...parts].sort().join(""), "utf8").digest("hex");
}

/** 安全模式的 msg_signature：token / timestamp / nonce / encrypt 字典序后 sha1 */
export function checkMsgSignature(
  token: string,
  signature: string,
  timestamp: string,
  nonce: string,
  encrypt: string
): boolean {
  if (!token || !signature || !encrypt) return false;
  return sha1Sorted([token, timestamp || "", nonce || "", encrypt]) === signature;
}

/** EncodingAESKey（43 位 base64）→ 32 字节 AES key；IV 取 key 前 16 字节 */
export function mpAesKey(cfg = mpConfig()): Buffer | null {
  const k = cfg.encodingAESKey;
  if (!/^[A-Za-z0-9]{43}$/.test(k)) return null;
  const buf = Buffer.from(`${k}=`, "base64");
  return buf.length === 32 ? buf : null;
}

/**
 * 解密微信加密消息，返回明文 XML。
 * 明文结构：16 字节随机串 + 4 字节网络序消息长度 + 消息正文 + appid（PKCS#7 按 32 字节块填充）
 */
export function decryptMsg(encrypt: string, cfg = mpConfig()): string {
  const key = mpAesKey(cfg);
  if (!key) throw new Error("未配置合法的 WECHAT_MP_AESKEY");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, key.subarray(0, 16));
  decipher.setAutoPadding(false); // 微信已手动做 PKCS#7 填充
  let plain: Buffer;
  try {
    plain = Buffer.concat([
      decipher.update(Buffer.from(encrypt, "base64")),
      decipher.final(),
    ]);
  } catch {
    throw new Error("微信消息解密失败");
  }
  const pad = plain.length ? plain[plain.length - 1] : 0;
  if (pad < 1 || pad > 32 || pad > plain.length) throw new Error("微信消息填充非法");
  plain = plain.subarray(0, plain.length - pad);
  if (plain.length < 20) throw new Error("微信消息长度非法");
  const msgLen = plain.readUInt32BE(16);
  if (20 + msgLen > plain.length) throw new Error("微信消息长度不匹配");
  const msg = plain.subarray(20, 20 + msgLen).toString("utf8");
  const recvAppId = plain.subarray(20 + msgLen).toString("utf8");
  if (cfg.appId && recvAppId !== cfg.appId) throw new Error("微信消息 appid 不匹配");
  return msg;
}

/** 把明文回复 XML 加密成微信安全模式要求的密文（base64） */
export function encryptMsg(plainXml: string, cfg = mpConfig()): string {
  const key = mpAesKey(cfg);
  if (!key) throw new Error("未配置合法的 WECHAT_MP_AESKEY");
  const body = Buffer.from(plainXml, "utf8");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(body.length, 0);
  const raw = Buffer.concat([
    crypto.randomBytes(16),
    lenBuf,
    body,
    Buffer.from(cfg.appId, "utf8"),
  ]);
  const block = 32;
  const pad = block - (raw.length % block); // 整除时补满一整块（1..32）
  const padded = Buffer.concat([raw, Buffer.alloc(pad, pad)]);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, key.subarray(0, 16));
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(padded), cipher.final()]).toString("base64");
}

/** 构造安全模式的加密回复 XML（含签名、时间戳、随机串） */
export function encryptedReplyXml(
  plainXml: string,
  timestamp: string,
  nonce: string,
  cfg = mpConfig()
): string {
  const encrypt = encryptMsg(plainXml, cfg);
  const signature = sha1Sorted([cfg.token, timestamp, nonce, encrypt]);
  return (
    `<xml><Encrypt><![CDATA[${encrypt}]]></Encrypt>` +
    `<MsgSignature><![CDATA[${signature}]]></MsgSignature>` +
    `<TimeStamp>${timestamp}</TimeStamp>` +
    `<Nonce><![CDATA[${esc(nonce)}]]></Nonce></xml>`
  );
}
