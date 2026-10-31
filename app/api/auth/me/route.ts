import { NextResponse } from "next/server";
import { getAdminFromCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getAdminFromCookie();
  if (!admin) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  return NextResponse.json({ username: admin.username, role: admin.role });
}
