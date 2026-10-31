import { NextRequest, NextResponse } from "next/server";
import { getContent } from "@/lib/store";
import { getAdminFromCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * 知识库材料正文访问（仅登录用户）：
 * - 默认 attachment 下载文本版
 * - ?mode=view → inline 在线阅读
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAdminFromCookie();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const doc = await getContent(params.id);
  if (!doc || doc.type !== "kb") {
    return new NextResponse("材料不存在或已被删除", {
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
