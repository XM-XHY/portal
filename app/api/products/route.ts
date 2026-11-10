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
import { getAdminFromCookie, clientIp } from "@/lib/session";
import { can } from "@/lib/auth";
import { PDOC_TYPE, isProductKind } from "@/lib/products";

export const dynamic = "force-dynamic";

const PDOC: ContentType = PDOC_TYPE;

function parseTags(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean).slice(0, 20);
  if (typeof v === "string") {
    return v.split(/[,，]/).map((s) => s.trim()).filter(Boolean).slice(0, 20);
  }
  return [];
}

/** 把请求体收敛为合法的 产品/解决方案 条目 */
function shape(b: any, base?: ContentItem): ContentItem {
  const type: ContentType = isProductKind(b?.type) ? b.type : base?.type || "product";
  return {
    id: base?.id || newId(type === "solution" ? "s" : "p"),
    type,
    title: String(b?.title || "").slice(0, 120),
    tag: String(b?.tag || "通用").slice(0, 20),
    summary: String(b?.summary || "").slice(0, 300),
    body: String(b?.body || "").slice(0, 8000),
    icon: String(b?.icon || (type === "solution" ? "🧩" : "📦")).slice(0, 8),
    tags: parseTags(b?.tags),
    client: "",
    industry: String(b?.industry || "").slice(0, 120), // 适用场景
    result: String(b?.result || "").slice(0, 120), // 成效亮点
    at: String(b?.at || new Date().toISOString().slice(0, 10)),
    order: base?.order ?? 0,
  };
}

function brief(d: ContentItem) {
  return {
    id: d.id,
    title: d.title,
    ext: d.tag,
    chars: d.body.length,
    at: d.at,
    summary: d.summary,
  };
}

/** 产品 + 解决方案列表（含各自资料清单），后台「产品中心」使用 */
export async function GET() {
  const admin = await getAdminFromCookie();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const all = await getContents();
  const docs = all.filter((c) => c.type === PDOC);
  const items = all
    .filter((c) => c.type === "product" || c.type === "solution")
    .sort((a, b) => a.order - b.order);

  return NextResponse.json(
    {
      items: items.map((i) => ({
        ...i,
        docs: docs.filter((d) => d.client === i.id).map(brief),
      })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/** 新增或编辑产品 / 解决方案 */
export async function POST(req: NextRequest) {
  const admin = await getAdminFromCookie();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!can(admin, "content.manage")) {
    return NextResponse.json({ error: "无权限，需要内容管理权限" }, { status: 403 });
  }

  const b = await req.json().catch(() => ({}));
  if (!String(b?.title || "").trim()) {
    return NextResponse.json({ error: "名称必填" }, { status: 400 });
  }

  const list = await getContents();
  let saved: ContentItem;
  let action: string;

  if (b?.id) {
    const idx = list.findIndex((x) => x.id === b.id);
    if (idx < 0) return NextResponse.json({ error: "条目不存在" }, { status: 404 });
    if (!isProductKind(list[idx].type)) {
      return NextResponse.json({ error: "该条目不是产品或解决方案" }, { status: 400 });
    }
    saved = shape(b, list[idx]);
    list[idx] = saved;
    action = "product.update";
  } else {
    const type: ContentType = isProductKind(b?.type) ? b.type : "product";
    // 产品与解决方案共用同一套展示顺序，新条目统一排在最后
    const max = list
      .filter((x) => x.type === "product" || x.type === "solution")
      .reduce((m, x) => Math.max(m, x.order || 0), 0);
    saved = { ...shape(b), order: max + 1 };
    list.push(saved);
    action = "product.create";
  }

  await saveContents(list);
  await appendAudit({
    actor: admin.username,
    action,
    target: `product:${saved.id}`,
    ip: clientIp(req),
    detail: `${saved.type === "solution" ? "解决方案" : "产品"}/${saved.title}`,
  });

  return NextResponse.json({ ok: true, item: saved });
}

/** 删除产品 / 解决方案（连带删除挂在它下面的产品资料） */
export async function DELETE(req: NextRequest) {
  const admin = await getAdminFromCookie();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!can(admin, "content.manage")) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });

  const list = await getContents();
  const target = list.find((x) => x.id === id);
  if (!target || !isProductKind(target.type)) {
    return NextResponse.json({ error: "未找到该产品或解决方案" }, { status: 404 });
  }

  // 资料文档跟着一起清理；资料若同步进过客服知识库，也一并移除
  const linkedKbIds = list
    .filter((x) => x.type === PDOC && x.client === id && x.industry)
    .map((x) => x.industry);
  const next = list.filter(
    (x) => x.id !== id && !(x.type === PDOC && x.client === id) && !linkedKbIds.includes(x.id)
  );
  // 差集删除：只删本次真正被移除的 id，绝不动其他数据
  const keep = new Set(next.map((x) => x.id));
  await deleteContents(list.filter((x) => !keep.has(x.id)).map((x) => x.id));

  await appendAudit({
    actor: admin.username,
    action: "product.delete",
    target: `product:${id}`,
    ip: clientIp(req),
    detail: target.title,
  });

  return NextResponse.json({ ok: true });
}
