import { NextResponse } from "next/server";
import { getAdmins } from "@/lib/store";
import { getAdminFromCookie } from "@/lib/session";
import { can } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getAdminFromCookie();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!can(admin.role, "users.manage")) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const admins = await getAdmins();
  return NextResponse.json(
    admins.map((a) => ({ username: a.username, role: a.role }))
  );
}
