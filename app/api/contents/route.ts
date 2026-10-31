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

export async function GET(req: NextRequest) {
  const type = (req.nextUrl.searchParams.get("type") as ContentType) || undefined;
  return NextResponse.json(await getContents(type));
}

export async function POST(req: NextRequest) {
  const admin = await getAdminFromCookie();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!can(admin.role, "content.manage")) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const b = await req.json().catch(() => ({}));
  const type = (b.type as ContentType) || "news";
  const item: ContentItem = {
    id: newId(type === "product" ? "p" : type === "case" ? "c" : "n"),
    type,
    title: String(b.title || "").slice(0, 120),
    tag: String(b.tag || "资讯").slice(0, 20),
    summary: String(b.summary || "").slice(0, 300),
    body: String(b.body || "").slice(0, 5000),
    icon: String(b.icon || "📄").slice(0, 8),
    tags: parseTags(b.tags),
    client: String(b.client || "").slice(0, 120),
    industry: String(b.industry || "").slice(0, 60),
    result: String(b.result || "").slice(0, 120),
    at: String(b.at || new Date().toISOString().slice(0, 10)),
    order: Number(b.order || 0) || 0,
  };
  if (!item.title) return NextResponse.json({ error: "标题必填" }, { status: 400 });
  const list = await getContents();
  list.unshift(item);
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
    type: (b.type as ContentType) || list[idx].type,
    title: String(b.title || "").slice(0, 120),
    tag: String(b.tag || "资讯").slice(0, 20),
    summary: String(b.summary || "").slice(0, 300),
    body: String(b.body || "").slice(0, 5000),
    icon: String(b.icon || "📄").slice(0, 8),
    tags: parseTags(b.tags),
    client: String(b.client || "").slice(0, 120),
    industry: String(b.industry || "").slice(0, 60),
    result: String(b.result || "").slice(0, 120),
    at: String(b.at || list[idx].at),
    order: Number(b.order || 0) || 0,
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
  const list = (await getContents()).filter((n) => n.id !== id);
  await saveContents(list);
  await appendAudit({
    actor: admin.username,
    action: "content.delete",
    target: `content:${id}`,
    ip: clientIp(req),
  });
  return NextResponse.json({ ok: true });
}
