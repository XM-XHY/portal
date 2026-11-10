import { NextResponse } from "next/server";
import { getAdminFromCookie } from "@/lib/session";
import { isInitialPasswordHash } from "@/lib/data/defaults";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getAdminFromCookie();
  if (!admin) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  return NextResponse.json({
    username: admin.username,
    role: admin.role,
    perms: admin.perms ?? undefined,
    // 仍是初始口令时后台顶部显示「请立即修改」横幅
    mustChangePassword: isInitialPasswordHash(admin.pwHash),
  });
}
