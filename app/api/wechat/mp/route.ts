import { NextRequest, NextResponse } from "next/server";
import { getContent, saveContents, deleteContents } from "@/lib/store";
import type { ContentItem } from "@/lib/data/types";
import {
  mpConfig,
  mpReady,
  mpSiteUrl,
  mpAesKey,
  checkSignature,
  checkMsgSignature,
  decryptMsg,
  encryptedReplyXml,
  parseXml,
  textReply,
} from "@/lib/wechat-mp";
import { lookupClass } from "@/lib/balance-lookup";

export const dynamic = "force-dynamic";

/**
 * 微信公众号服务器地址（消息接口）。
 *
 * GET  → 微信校验服务器有效性（明文模式原样返回 echostr；安全模式解密后返回）
 * POST → 接收粉丝消息，被动回复分班查询结果
 *
 * 三种消息模式全部支持：明文模式 / 兼容模式 / 安全模式（EncodingAESKey）。
 * 安全模式需在后台配置 WECHAT_MP_AESKEY（43 位）。
 *
 * 交互设计（尽量让家长零学习成本）：
 *   1. 粉丝先发 6 位查询码（如 J52HJV）→ 记住该粉丝的查询码
 *   2. 之后直接发学生姓名（如 李小明）→ 回复所在班级
 *   3. 也可以一次发「J52HJV 李小明」（空格或换行分隔）
 *   4. 若环境变量配置了 WECHAT_MP_DEFAULT_CODE，家长连查询码都不用发，直接发姓名即可
 *   5. 发「帮助 / 查询码 / 解绑」→ 查看说明、当前绑定或解除绑定
 *   6. 菜单 CLICK 事件按 EventKey 响应（HELP / QUERY / UNBIND）
 */

function helpText(): string {
  return [
    "📚 分班结果查询",
    "",
    "① 先发送老师给的 6 位查询码",
    "② 再发送学生姓名，即可查到班级",
    "",
    "也可以一次发送「查询码 姓名」，例如：J52HJV 李小明",
    "",
    "发送「查询码」查看当前绑定；发送「解绑」清除绑定",
    "",
    "也可以直接打开网页查询：",
    `${mpSiteUrl()}/balance/query`,
  ].join("\n");
}

function welcomeText(): string {
  return [
    "欢迎关注！这里是分班结果查询入口。",
    "",
    "请发送老师提供的 6 位查询码，再发送学生姓名即可查到班级。",
    "发送「帮助」查看详细用法。",
  ].join("\n");
}

/** 查询码 + 姓名的组合：空格/换行/中文顿号分隔 */
function splitCodeAndName(text: string): { code: string; name: string } | null {
  const m = text.trim().match(/^([A-Za-z0-9]{4,10})[\s、,，:：]+(.{1,40})$/);
  if (!m) return null;
  return { code: m[1].toUpperCase(), name: m[2].trim() };
}

/** 绑定关系：openid → 查询码，存 contents(type=mp_bind, id=mp_<openid>) */
async function getBoundCode(openid: string): Promise<string> {
  const it = await getContent(`mp_${openid}`);
  if (!it || it.type !== "mp_bind") return "";
  try {
    return String(JSON.parse(it.body)?.code || "").toUpperCase();
  } catch {
    return "";
  }
}

async function bindCode(openid: string, code: string): Promise<void> {
  const item: ContentItem = {
    id: `mp_${openid}`,
    type: "mp_bind",
    title: `公众号查询码绑定 ${code}`,
    tag: "mp",
    summary: "",
    body: JSON.stringify({ code, at: new Date().toISOString() }),
    icon: "",
    tags: [],
    client: openid,
    industry: "",
    result: "",
    at: new Date().toISOString(),
    order: 0,
  };
  await saveContents([item]);
}

async function unbindCode(openid: string): Promise<void> {
  await deleteContents([`mp_${openid}`]);
}

function xml(body: string, status = 200) {
  return new NextResponse(body, {
    status,
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}

/** 从加密 XML 里取出 <Encrypt> 密文 */
function pickEncrypt(raw: string): string {
  const m = raw.match(/<Encrypt>([\s\S]*?)<\/Encrypt>/);
  if (!m) return "";
  const cd = m[1].match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return (cd ? cd[1] : m[1]).trim();
}

function replyForClick(eventKey: string): string {
  switch ((eventKey || "").toUpperCase()) {
    case "QUERY":
    case "BALANCE_QUERY":
      return "请直接发送学生姓名查询班级；若尚未绑定，先发送老师给的 6 位查询码。";
    case "HELP":
    default:
      return helpText();
  }
}

/** 服务器地址校验（微信 GET 请求） */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const signature = sp.get("signature") || "";
  const msgSignature = sp.get("msg_signature") || "";
  const timestamp = sp.get("timestamp") || "";
  const nonce = sp.get("nonce") || "";
  const echostr = sp.get("echostr") || "";
  const cfg = mpConfig();
  if (!mpReady(cfg)) {
    return new NextResponse("公众号未配置（缺少 WECHAT_MP_TOKEN / WECHAT_MP_APPID）", {
      status: 503,
    });
  }

  // 安全模式的 GET 明确带 encrypt_type=aes + msg_signature，echostr 是密文
  const safeMode = sp.get("encrypt_type") === "aes" && !!msgSignature && !!mpAesKey(cfg);
  if (safeMode && echostr) {
    if (!checkMsgSignature(cfg.token, msgSignature, timestamp, nonce, echostr)) {
      return new NextResponse("消息签名校验失败", { status: 403 });
    }
    try {
      return new NextResponse(decryptMsg(echostr, cfg), { status: 200 });
    } catch {
      return new NextResponse("echostr 解密失败", { status: 403 });
    }
  }

  if (!checkSignature(cfg.token, signature, timestamp, nonce)) {
    return new NextResponse("签名校验失败", { status: 403 });
  }
  return new NextResponse(echostr, { status: 200 });
}

/** 接收消息并被动回复 */
export async function POST(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const cfg = mpConfig();
  if (!mpReady(cfg)) {
    return xml(textReply("", "", "公众号未配置"), 200);
  }

  const signature = sp.get("signature") || "";
  const msgSignature = sp.get("msg_signature") || "";
  const timestamp = sp.get("timestamp") || String(Math.floor(Date.now() / 1000));
  const nonce = sp.get("nonce") || "";

  const raw = await req.text();
  let plainXml = raw;
  let encrypted = false;

  // 以「消息体是否含 <Encrypt>」为准，兼容模式（URL 带 msg_signature 但 body 是明文）不会误判为安全模式
  const safeMode = /<Encrypt>/.test(raw);
  if (safeMode) {
    const encrypt = pickEncrypt(raw);
    if (!mpAesKey(cfg)) {
      return new NextResponse("服务器未配置 WECHAT_MP_AESKEY，无法处理安全模式消息", { status: 500 });
    }
    if (!checkMsgSignature(cfg.token, msgSignature, timestamp, nonce, encrypt)) {
      return new NextResponse("消息签名校验失败", { status: 403 });
    }
    try {
      plainXml = decryptMsg(encrypt, cfg);
      encrypted = true;
    } catch {
      return new NextResponse("消息解密失败", { status: 403 });
    }
  } else if (!checkSignature(cfg.token, signature, timestamp, nonce)) {
    return new NextResponse("签名校验失败", { status: 403 });
  }

  const msg = parseXml(plainXml);
  const openid = msg.fromUserName;
  const to = msg.toUserName;
  if (!openid) return noReply();

  function noReply() {
    // 安全模式下「不回复」必须返回空串，明文模式下微信接受 success
    return xml(encrypted ? "" : "success", 200);
  }
  function reply(text: string) {
    const plain = textReply(openid, to, text);
    return xml(encrypted ? encryptedReplyXml(plain, timestamp, nonce, cfg) : plain, 200);
  }

  // 关注 / 扫码 / 菜单 CLICK 事件
  if (msg.msgType === "event") {
    const ev = (msg.event || "").toLowerCase();
    if (ev === "subscribe" || ev === "scan") return reply(welcomeText());
    if (ev === "unsubscribe") return noReply();
    if (ev === "click") {
      const key = (msg.eventKey || "").toUpperCase();
      if (key === "UNBIND") {
        await unbindCode(openid);
        return reply("✅ 已解除查询码绑定。之后可重新发送新的查询码。");
      }
      return reply(replyForClick(msg.eventKey));
    }
    return noReply();
  }

  if (msg.msgType !== "text") {
    return reply("目前只支持文字查询。请发送查询码或学生姓名。");
  }

  const text = (msg.content || "").trim();

  // 帮助 / 查询当前绑定 / 解绑
  if (!text || /^(帮助|help|\?|？|使用说明|怎么用)$/i.test(text)) return reply(helpText());
  if (/^(解绑|解除绑定|清除绑定|unbind|换查询码)$/i.test(text)) {
    await unbindCode(openid);
    return reply("✅ 已解除查询码绑定。发送新的 6 位查询码即可重新绑定。");
  }
  if (/^(查询码|绑定|我的查询码|mycode)$/i.test(text)) {
    const bound = (await getBoundCode(openid)) || cfg.defaultCode;
    return reply(bound ? `当前查询码：${bound}\n\n直接发送学生姓名即可查询。` : `尚未绑定查询码。\n\n${helpText()}`);
  }

  // ① 「查询码 姓名」一次发送
  const pair = splitCodeAndName(text);
  if (pair) {
    await bindCode(openid, pair.code);
    const r = await lookupClass(pair.code, pair.name);
    return reply(formatResult(r));
  }

  // ② 单独发送查询码 → 绑定
  if (/^[A-Za-z0-9]{4,10}$/.test(text)) {
    const code = text.toUpperCase();
    await bindCode(openid, code);
    return reply(`✅ 已记住查询码 ${code}\n\n请直接发送学生姓名查询班级。`);
  }

  // ③ 其余按姓名处理（用已绑定或默认的查询码）
  const code = (await getBoundCode(openid)) || cfg.defaultCode;
  if (!code) {
    return reply(`请先发送老师提供的查询码，再发送学生姓名。\n\n${helpText()}`);
  }
  const r = await lookupClass(code, text);
  return reply(formatResult(r));
}

function formatResult(r: Awaited<ReturnType<typeof lookupClass>>): string {
  if (!r.ok) return `❗${r.error}`;
  const lines = [`🎓 ${r.title}`, ``, `${r.name} 同学：${r.className}`];
  if (r.duplicate && r.duplicate.length > 1) {
    lines.push("", `注意：有 ${r.duplicate.length} 个同名学生，分别在 ${r.duplicate.join("、")}，请联系老师确认。`);
  }
  return lines.join("\n");
}
