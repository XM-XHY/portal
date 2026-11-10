import { NextRequest, NextResponse } from "next/server";
import { fetchWithTimeout, TimeoutError } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 同域反向代理：/api/ent/<...>  →  ${TWB_ENT_API_BASE}/<...>
 *
 * 用途：教师工作台静态页部署在 public/teacher/ 后，用相对路径 /api/ent/* 访问
 * 云函数 ent，既避免跨域，也不把云函数网关地址暴露给浏览器。
 *
 * 安全要点：
 *  - 目标根地址固定取自服务端环境变量 TWB_ENT_API_BASE，浏览器无法指定上游主机；
 *  - 路径每段走白名单，显式拒绝 "." / ".."，杜绝 SSRF / 路径穿越；
 *  - 请求体用 req.text() 原样转发，不做 JSON 解析，保证微信支付回调验签的 raw body 字节一致；
 *  - 请求头按白名单透传（含全部 wechatpay-* 验签头），不透传 host。
 */

const TIMEOUT_MS = 10_000;
const SEGMENT_RE = /^[A-Za-z0-9_.-]+$/;

/** 允许透传给云函数 ent 的请求头（host 一律不透传）。 */
const FORWARD_HEADERS = [
  "authorization",
  "content-type",
  "accept",
  "x-ent-admin",
  "x-ent-admin-operator",
  "x-twb-internal",
] as const;

/** OPTIONS 预检响应：仅列出允许的方法与请求头，不开放 Access-Control-Allow-Origin。 */
const OPTIONS_HEADERS: Record<string, string> = {
  Allow: "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, content-type, accept, x-ent-admin, x-ent-admin-operator, x-twb-internal, x-forwarded-for, wechatpay-serial, wechatpay-signature, wechatpay-timestamp, wechatpay-nonce, wechatpay-signature-type",
};

type Ctx = { params: { path: string[] } };

async function proxy(req: NextRequest, ctx: Ctx, method: "GET" | "POST" | "PUT") {
  const base = (process.env.TWB_ENT_API_BASE || "").trim().replace(/\/+$/, "");
  if (!base) {
    return NextResponse.json(
      { error: "未配置 TWB_ENT_API_BASE（云函数 ent 网关根地址），同域代理不可用" },
      { status: 503 }
    );
  }

  const segments = ctx?.params?.path;
  if (!Array.isArray(segments) || segments.length === 0) {
    return NextResponse.json({ error: "缺少代理路径" }, { status: 400 });
  }
  for (const seg of segments) {
    const s = String(seg);
    // 白名单之外一律拒绝；同时挡掉 "." / ".."，避免 URL 归一化把 /ent 前缀吃掉造成路径穿越
    if (!SEGMENT_RE.test(s) || s === "." || s === "..") {
      return NextResponse.json({ error: "代理路径包含非法字符" }, { status: 400 });
    }
  }

  // 原样透传查询串（URL.search 保留百分号编码，不做重新编码）
  const search = new URL(req.url).search;
  const target = `${base}/${segments.join("/")}${search}`;

  const outHeaders = new Headers();
  for (const name of FORWARD_HEADERS) {
    const v = req.headers.get(name);
    if (v !== null) outHeaders.set(name, v);
  }
  // 微信支付回调验签头全部透传
  req.headers.forEach((v, k) => {
    if (k.startsWith("wechatpay-")) outHeaders.set(k, v);
  });
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  outHeaders.set("x-forwarded-for", ip);

  const init: RequestInit = {
    method,
    headers: outHeaders,
    cache: "no-store",
  };
  if (method !== "GET") {
    // 原始文本转发，绝不 JSON.parse/stringify（回调验签依赖报文原始字节）
    init.body = await req.text();
  }

  let upstream: Response;
  try {
    upstream = await fetchWithTimeout(target, init, TIMEOUT_MS);
  } catch (e) {
    const msg = e instanceof TimeoutError
      ? "云函数网关请求超时（10 秒）"
      : `无法连接云函数网关：${e instanceof Error ? e.message : "网络错误"}`;
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const respHeaders = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType) respHeaders.set("content-type", contentType);
  if (method === "GET") respHeaders.set("Cache-Control", "no-store");

  // 204/205/304 按规范不能带响应体
  if ([204, 205, 304].includes(upstream.status)) {
    return new Response(null, { status: upstream.status, headers: respHeaders });
  }
  const body = await upstream.arrayBuffer();
  return new Response(body, { status: upstream.status, headers: respHeaders });
}

export async function GET(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx, "GET");
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx, "POST");
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx, "PUT");
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: OPTIONS_HEADERS });
}
