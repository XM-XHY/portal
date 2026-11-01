import { NextResponse } from "next/server";
import { getAdminFromCookie } from "@/lib/session";
import { paymentStatus } from "@/lib/payment";

export const dynamic = "force-dynamic";

/** 后台读取支付通道配置状态（仅返回是否已配置，不含任何密钥） */
export async function GET() {
  const me = await getAdminFromCookie();
  if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });
  return NextResponse.json(paymentStatus());
}
