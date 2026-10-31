import { NextRequest, NextResponse } from "next/server";
import { verifyPassword, setAdminPassword, appendAudit } from "@/lib/store";
import { getAdminFromCookie, clientIp } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const admin = await getAdminFromCookie();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { oldPassword, newPassword } = await req.json().catch(() => ({}));
  if (!oldPassword || !newPassword) {
    return NextResponse.json({ error: "请填写原密码与新密码" }, { status: 400 });
  }
  if (!verifyPassword(oldPassword, admin.pwHash)) {
    return NextResponse.json({ error: "原密码错误" }, { status: 400 });
  }
  if (String(newPassword).length < 8) {
    return NextResponse.json({ error: "新密码至少 8 位" }, { status: 400 });
  }
  await setAdminPassword(admin.id, newPassword);
  await appendAudit({
    actor: admin.username,
    action: "password.change",
    target: `admin:${admin.username}`,
    ip: clientIp(req),
  });
  return NextResponse.json({ ok: true });
}
