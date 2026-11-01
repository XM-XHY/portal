import { NextResponse } from "next/server";
import { getAdminFromCookie } from "@/lib/session";
import { selfCheck } from "@/lib/payment";

export const dynamic = "force-dynamic";

/** 后台支付配置自检：返回缺失配置项名称 + 微信接口连通性（不含任何密钥内容） */
export async function GET() {
  const me = await getAdminFromCookie();
  if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });
  try {
    return NextResponse.json(await selfCheck());
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "自检失败" }, { status: 500 });
  }
}
