import { NextRequest, NextResponse } from "next/server";
import { getContents, saveContents, newId, appendAudit } from "@/lib/store";
import { getAdminFromCookie, clientIp } from "@/lib/session";
import { can } from "@/lib/auth";
import { KB_TYPE, KB_ACCEPT, KB_MAX_SIZE, parseDocument } from "@/lib/kb";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 知识库文档列表（登录即可查看；正文截断为摘要防大响应） */
export async function GET() {
  const admin = await getAdminFromCookie();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const docs = await getContents(KB_TYPE);
  return NextResponse.json(
    docs.map((d) => ({
      id: d.id,
      title: d.title,
      ext: d.tag,
      size: d.result, // 存字符数
      summary: d.summary,
      at: d.at,
      chars: d.body.length,
    })),
    { headers: { "Cache-Control": "no-store" } }
  );
}

/** 上传并解析文档（Word/Excel/CSV/PDF/TXT/MD），提取全文入库 */
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
  if (file.size > KB_MAX_SIZE) {
    return NextResponse.json({ error: "文件超过 10MB 限制" }, { status: 400 });
  }

  const title = String(form.get("title") || file.name || "未命名文档").slice(0, 120);

  let text: string;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    ({ text } = await parseDocument(buf, file.name || title));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "文档解析失败" },
      { status: 400 }
    );
  }

  if (!text || text.replace(/\s/g, "").length < 5) {
    return NextResponse.json(
      { error: "未能从文档中提取到有效文字（可能是扫描件/纯图片 PDF，暂不支持 OCR）" },
      { status: 400 }
    );
  }
  if (text.length > 200_000) text = text.slice(0, 200_000);

  const ext = (file.name?.split(".").pop() || "txt").toLowerCase();
  const icons: Record<string, string> = {
    docx: "📝", doc: "📝", xlsx: "📊", xls: "📊", csv: "📊", pdf: "📕", txt: "📄", md: "📄",
  };

  const doc = {
    id: newId("k"),
    type: KB_TYPE as any,
    title,
    tag: ext,
    summary: text.replace(/\s+/g, " ").slice(0, 80),
    body: text,
    icon: icons[ext] || "📄",
    tags: [] as string[],
    client: file.name || "",
    industry: "",
    result: String(text.length), // 字符数
    at: new Date().toISOString().slice(0, 10),
    order: Math.floor(Date.now() / 1000), // order 列为 int4，用秒级时间戳避免溢出
  };

  const list = await getContents();
  list.unshift(doc as any);
  await saveContents(list);

  await appendAudit({
    actor: admin.username,
    action: "kb.import",
    target: `kb:${doc.id}`,
    ip: clientIp(req),
    detail: `${title}（${text.length} 字）`,
  });

  return NextResponse.json({ ok: true, id: doc.id, chars: text.length });
}

/** 删除知识库文档 */
export async function DELETE(req: NextRequest) {
  const admin = await getAdminFromCookie();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!can(admin.role, "content.manage")) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });

  const list = await getContents();
  const idx = list.findIndex((x) => x.id === id && x.type === KB_TYPE);
  if (idx < 0) return NextResponse.json({ error: "文档不存在" }, { status: 404 });

  const [removed] = list.splice(idx, 1);
  await saveContents(list);
  await appendAudit({
    actor: admin.username,
    action: "kb.delete",
    target: `kb:${id}`,
    ip: clientIp(req),
    detail: removed.title,
  });
  return NextResponse.json({ ok: true });
}
