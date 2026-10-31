import { NextRequest, NextResponse } from "next/server";
import {
  getContents,
  saveContents,
  newId,
  appendAudit,
  type ContentItem,
} from "@/lib/store";
import { getAdminFromCookie, clientIp } from "@/lib/session";
import { can } from "@/lib/auth";
import { parseDocument } from "@/lib/kb";
import { PDOC_TYPE, PDOC_MAX_SIZE, docIcon, isProductKind } from "@/lib/products";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PDOC: ContentItem["type"] = PDOC_TYPE;

/**
 * 产品资料：管理员把 Word/Excel/PDF/TXT/MD 导入到某个产品/解决方案下，
 * 提取正文存进 contents（type=pdoc，client=所属条目 id），前台详情页可在线阅读 / 下载文本版。
 */

/** 某个产品下的资料清单（后台用） */
export async function GET(req: NextRequest) {
  const admin = await getAdminFromCookie();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const productId = req.nextUrl.searchParams.get("productId");
  if (!productId) return NextResponse.json({ error: "缺少 productId" }, { status: 400 });

  const all = await getContents();
  const docs = all.filter((d) => d.type === PDOC && d.client === productId);
  return NextResponse.json(
    docs.map((d) => ({
      id: d.id,
      title: d.title,
      ext: d.tag,
      chars: d.body.length,
      at: d.at,
      summary: d.summary,
    })),
    { headers: { "Cache-Control": "no-store" } }
  );
}

/** 导入资料文档：multipart/form-data，字段 productId / file / title / alsoKb */
export async function POST(req: NextRequest) {
  const admin = await getAdminFromCookie();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!can(admin.role, "content.manage")) {
    return NextResponse.json({ error: "无权限，需要内容管理权限" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "请求需为 multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "缺少文件字段 file" }, { status: 400 });
  }
  if (file.size > PDOC_MAX_SIZE) {
    return NextResponse.json({ error: "文件超过 10MB 限制" }, { status: 400 });
  }

  const productId = String(form.get("productId") || "");
  if (!productId) return NextResponse.json({ error: "缺少所属产品 productId" }, { status: 400 });

  const list = await getContents();
  const product = list.find((x) => x.id === productId && isProductKind(x.type));
  if (!product) return NextResponse.json({ error: "所属产品不存在" }, { status: 404 });

  const title = String(form.get("title") || file.name || "未命名资料").slice(0, 120);

  let parsed: { text: string; ext: string };
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    parsed = await parseDocument(buf, file.name || title);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "文档解析失败" },
      { status: 400 }
    );
  }

  let text = parsed.text || "";
  if (text.replace(/\s/g, "").length < 2) {
    return NextResponse.json(
      { error: "未能从文档中提取到有效文字（可能是扫描件/纯图片 PDF，暂不支持 OCR）" },
      { status: 400 }
    );
  }
  if (text.length > 200_000) text = text.slice(0, 200_000);

  const doc: ContentItem = {
    id: newId("pd"),
    type: PDOC,
    title,
    tag: parsed.ext,
    summary: text.replace(/\s+/g, " ").slice(0, 80),
    body: text,
    icon: docIcon(parsed.ext),
    tags: [],
    client: productId,
    industry: "", // 若同步进客服知识库，这里记录对应 kb 文档 id
    result: String(text.length),
    at: new Date().toISOString().slice(0, 10),
    order: Math.floor(Date.now() / 1000), // order 列为 int4，用秒级时间戳避免溢出
  };

  const alsoKb = String(form.get("alsoKb") || "") === "1";
  if (alsoKb) {
    const kb: ContentItem = {
      ...doc,
      id: newId("k"),
      type: "kb",
      client: file.name || "",
      industry: "",
    };
    doc.industry = kb.id;
    list.push(kb);
  }
  list.push(doc);

  await saveContents(list);
  await appendAudit({
    actor: admin.username,
    action: "product.doc.import",
    target: `pdoc:${doc.id}`,
    ip: clientIp(req),
    detail: `${product.title} / ${title}（${text.length} 字${alsoKb ? "，同步客服知识库" : ""}）`,
  });

  return NextResponse.json({
    ok: true,
    id: doc.id,
    chars: text.length,
    ext: parsed.ext,
    kb: alsoKb,
  });
}

/** 删除产品资料（若它同步过客服知识库则一并清理） */
export async function DELETE(req: NextRequest) {
  const admin = await getAdminFromCookie();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!can(admin.role, "content.manage")) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });

  const list = await getContents();
  const doc = list.find((x) => x.id === id && x.type === PDOC);
  if (!doc) return NextResponse.json({ error: "资料不存在" }, { status: 404 });

  const linkedKb = doc.industry;
  const next = list.filter((x) => x.id !== id && !(linkedKb && x.id === linkedKb));
  await saveContents(next);

  await appendAudit({
    actor: admin.username,
    action: "product.doc.delete",
    target: `pdoc:${id}`,
    ip: clientIp(req),
    detail: doc.title,
  });

  return NextResponse.json({ ok: true });
}
