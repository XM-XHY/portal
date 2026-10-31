import { NextRequest, NextResponse } from "next/server";
import { getContent } from "@/lib/store";
import { PDOC_TYPE } from "@/lib/products";

export const dynamic = "force-dynamic";

/**
 * 产品资料公开访问：
 * - 默认 attachment → 下载文本版（文件名 RFC 5987 编码，兼容中文）
 * - ?mode=view → inline，浏览器内直接阅读
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const doc = await getContent(params.id);
  if (!doc || doc.type !== PDOC_TYPE) {
    return new NextResponse("资料不存在或已被删除", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const view = req.nextUrl.searchParams.get("mode") === "view";
  const filename = `${doc.title}.txt`;

  return new NextResponse(doc.body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `${view ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
