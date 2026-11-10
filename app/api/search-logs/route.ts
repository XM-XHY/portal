import { NextResponse } from "next/server";
import { getSearchLogs } from "@/lib/store";
import { getAdminFromCookie } from "@/lib/session";
import { can } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getAdminFromCookie();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!can(admin, "search.logs")) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  return NextResponse.json(await getSearchLogs());
}
