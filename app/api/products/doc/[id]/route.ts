import { NextRequest, NextResponse } from "next/server";
import { getContent } from "@/lib/store";
import { PDOC_TYPE } from "@/lib/products";
import { requirePaidAccess } from "@/lib/pay-access";
import { getAdminFromCookie } from "@/lib/session";
import { can } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * 产品资料公开访问：
 * - 默认 attachment → 下载文本版（文件名 RFC 5987 编码，兼容中文）
 * - ?mode=view → inline，浏览器内直接阅读
 *
 * 付费：后台按「产品」配置下载收费，pdoc.client 存所属产品 id。
 * 开启收费后必须带服务端签发的 grant 票据才能读取，杜绝直接请求接口绕过付费墙。
 * 后台内容管理员预览资料时豁免（同样的数据在后台 CMS 里本就可查看）。
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const doc = await getContent(params.id);
  if (!doc || doc.type !== PDOC_TYPE) {
    return new NextResponse("资料不存在或已被删除", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const admin = await getAdminFromCookie();
  const isManager = !!admin && can(admin, "content.manage");
  if (!isManager) {
    const access = await requirePaidAccess(req, doc.client || doc.id);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.error, needPay: true, amount: access.amount, productId: doc.client || doc.id },
        { status: access.status, headers: { "Cache-Control": "no-store" } }
      );
    }
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
