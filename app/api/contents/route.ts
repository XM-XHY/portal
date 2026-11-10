import { NextRequest, NextResponse } from "next/server";
import {
  getContents,
  saveContents,
  deleteContents,
  newId,
  appendAudit,
  type ContentItem,
  type ContentType,
} from "@/lib/store";
import { SYSTEM_CONTENT_TYPES } from "@/lib/data/types";
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
/** 批量导入允许的类型（含系统内部类型，用于数据恢复/迁移） */
const ALL_TYPES = new Set<ContentType>([
  "news",
  "product",
  "solution",
  "case",
  "kb",
  "pdoc",
  "sched",
  "sched_share",
  "paycfg",
  "order",
  "balance_pub",
  "mp_bind",
  "hub_material",
  // rate（限流计数桶）属于高频写入的系统内部数据，不允许通过后台导入
]);

const SYSTEM_SET = new Set<ContentType>(SYSTEM_CONTENT_TYPES);

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
  // 知识库文档（kb）/产品资料（pdoc）有专用管理入口；系统内部类型（订单、限流桶等）不出现在 CMS 列表
  return NextResponse.json(
    all.filter((c) => c.type !== "kb" && c.type !== "pdoc" && !SYSTEM_SET.has(c.type))
  );
}

export async function POST(req: NextRequest) {
  const admin = await getAdminFromCookie();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!can(admin, "content.manage")) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const raw = await req.json().catch(() => ({}));

  // 批量导入 / 恢复：传入数组时按原 id 整体写入（用于数据恢复与迁移）
  if (Array.isArray(raw)) {
    const items: ContentItem[] = [];
    for (const it of raw) {
      if (!it || !it.id || !it.type) continue;
      items.push({
        id: String(it.id).slice(0, 60),
        type: ALL_TYPES.has(it.type as ContentType) ? (it.type as ContentType) : "news",
        title: String(it.title || "").slice(0, 120),
        tag: String(it.tag || "通用").slice(0, 20),
        summary: String(it.summary || "").slice(0, 300),
        body: String(it.body || ""),
        icon: String(it.icon || "📄").slice(0, 8),
        tags: Array.isArray(it.tags) ? it.tags.map((t: any) => String(t)).slice(0, 20) : [],
        client: String(it.client || "").slice(0, 120),
        industry: String(it.industry || "").slice(0, 120),
        result: String(it.result || "").slice(0, 120),
        at: String(it.at || new Date().toISOString().slice(0, 10)),
        order: Number(it.order) || 0,
      });
    }
    if (!items.length) return NextResponse.json({ error: "没有可导入的条目" }, { status: 400 });
    await saveContents(items);
    await appendAudit({
      actor: admin.username,
      action: "content.import",
      target: `content:*`,
      ip: clientIp(req),
      detail: `批量导入 ${items.length} 条`,
    });
    return NextResponse.json({ ok: true, count: items.length });
  }

  const b = raw;
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
  if (!can(admin, "content.manage")) {
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
  if (!can(admin, "content.manage")) {
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
  await deleteContents([id]);
  await appendAudit({
    actor: admin.username,
    action: "content.delete",
    target: `content:${id}`,
    ip: clientIp(req),
  });
  return NextResponse.json({ ok: true });
}
