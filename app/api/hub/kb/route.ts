import { NextResponse } from "next/server";
import { getContents } from "@/lib/store";
import { getAdminFromCookie } from "@/lib/session";
import { toHubDoc } from "@/lib/hub";

export const dynamic = "force-dynamic";

/**
 * 企业知识中枢：知识库材料列表（正文不返回，防止一次拉取过大）。
 * 登录即可访问（员工账号 / 后台账号均可），未登录一律 401。
 */
export async function GET() {
  const user = await getAdminFromCookie();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const docs = await getContents("kb");
  return NextResponse.json(
    docs.map((d) => ({
      ...toHubDoc(d),
      chars: d.body.length,
    })),
    { headers: { "Cache-Control": "no-store" } }
  );
}
