import { NextRequest, NextResponse } from "next/server";
import { getContents, saveContents, newId, appendAudit, type ContentItem, type ContentType } from "@/lib/store";
import { getAdminFromCookie, clientIp } from "@/lib/session";
import { can } from "@/lib/auth";

export const dynamic = "force-dynamic";

function parseTags(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean).slice(0, 20);
  if (typeof v === "string") return v.split(/[,，]/).map((s) => s.trim()).filter(Boolean).slice(0, 20);
  return [];
}

/** 内容管理里可维护的前台展示类型（知识库 kb / 产品资料 pdoc 有各自专用接口） */
const EDITABLE_TYPES = new Set<ContentType>(["news", "product", "solution", "case"]);

function normalizeType(v: unknown, fallback: ContentType = "news"): ContentType {
  return EDITABLE_TYPES.has(v as ContentType) ? (v as ContentType) : fallback;
}

function idPrefix(type: ContentType): string {
  if (type === "product") return "p";
  if (type === "solution") return "s";
  if (type === "case") return "c";
  return "n";
}

/** 当前最大排序值，用于「新建默认排在末尾」；产品与解决方案共用一套顺序 */
function maxOrderOf(list: ContentItem[], type: ContentType): number {
  const scope =
    type === "product" || type === "solution"
      ? list.filter((c) => c.type === "product" || c.type === "solution")
      : list.filter((c) => c.type === type);
  return scope.reduce((m, c) => Math.max(m, c.order || 0), 0);
}

export async function GET(req: NextRequest) {
  const type = (req.nextUrl.searchParams.get("type") as ContentType) || undefined;
  const all = await getContents(type);
  // 知识库文档（kb）与产品资料（pdoc）有各自的专用管理入口，不在这里重复出现
  return NextResponse.json(all.filter((c) => c.type !== "kb" && c.type !== "pdoc"));
}

export async function POST(req: NextRequest) {
  const admin = await getAdminFromCookie();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!can(admin.role, "content.manage")) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const b = await req.json().catch(() => ({}));
  const type = normalizeType(b.type);
  const list0 = await getContents();
  const item: ContentItem = {
    id: newId(idPrefix(type)),
    type,
    title: String(b.title || "").slice(0, 120),
    tag: String(b.tag || (type === "news" ? "资讯" : "通用")).slice(0, 20),
    summary: String(b.summary || "").slice(0, 300),
    body: String(b.body || "").slice(0, 5000),
    icon: String(b.icon || (type === "solution" ? "🧩" : "📄")).slice(0, 8),
    tags: parseTags(b.tags),
    client: String(b.client || "").slice(0, 120),
    industry: String(b.industry || "").slice(0, 120), // 产品/解决方案：适用场景
    result: String(b.result || "").slice(0, 120),
    at: String(b.at || new Date().toISOString().slice(0, 10)),
    order: Number(b.order) || maxOrderOf(list0, type) + 1,
  };
  if (!item.title) return NextResponse.json({ error: "标题必填" }, { status: 400 });
  const list = list0;
  list.push(item);
  await saveContents(list);
  await appendAudit({
    actor: admin.username,
    action: "content.create",
    target: `content:${item.id}`,
    ip: clientIp(req),
    detail: `${item.type}/${item.title}`,
  });
  return NextResponse.json({ ok: true, item });
}

export async function PUT(req: NextRequest) {
  const admin = await getAdminFromCookie();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!can(admin.role, "content.manage")) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const b = await req.json().catch(() => ({}));
  if (!b.id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  const list = await getContents();
  const idx = list.findIndex((n) => n.id === b.id);
  if (idx < 0) return NextResponse.json({ error: "未找到" }, { status: 404 });
  list[idx] = {
    ...list[idx],
    type: normalizeType(b.type, list[idx].type),
    title: String(b.title || "").slice(0, 120),
    tag: String(b.tag || "资讯").slice(0, 20),
    summary: String(b.summary || "").slice(0, 300),
    body: String(b.body || "").slice(0, 5000),
    icon: String(b.icon || "📄").slice(0, 8),
    tags: parseTags(b.tags),
    client: String(b.client || "").slice(0, 120),
    industry: String(b.industry || "").slice(0, 120),
    result: String(b.result || "").slice(0, 120),
    at: String(b.at || list[idx].at),
    order: Number(b.order) || list[idx].order,
  };
  await saveContents(list);
  await appendAudit({
    actor: admin.username,
    action: "content.update",
    target: `content:${b.id}`,
    ip: clientIp(req),
    detail: list[idx].title,
  });
  return NextResponse.json({ ok: true, item: list[idx] });
}

export async function DELETE(req: NextRequest) {
  const admin = await getAdminFromCookie();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!can(admin.role, "content.manage")) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  const all = await getContents();
  const target = all.find((n) => n.id === id);
  if (target && !EDITABLE_TYPES.has(target.type)) {
    return NextResponse.json(
      { error: "该条目属于知识库 / 产品资料模块，请在对应入口管理" },
      { status: 403 }
    );
  }
  const list = all.filter((n) => n.id !== id);
  await saveContents(list);
  await appendAudit({
    actor: admin.username,
    action: "content.delete",
    target: `content:${id}`,
    ip: clientIp(req),
  });
  return NextResponse.json({ ok: true });
}
