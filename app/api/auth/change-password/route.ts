import { NextRequest, NextResponse } from "next/server";
import { verifyPassword, setAdminPassword, appendAudit } from "@/lib/store";
import { getAdminFromCookie, clientIp } from "@/lib/session";
import { initialAdminPassword } from "@/lib/data/defaults";

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
  const np = String(newPassword);
  if (np.length < 8 || np.length > 128) {
    return NextResponse.json({ error: "新密码需为 8-128 位" }, { status: 400 });
  }
  if (np === initialAdminPassword()) {
    return NextResponse.json({ error: "新密码不能与初始口令相同，请换一个" }, { status: 400 });
  }
  if (!/[A-Za-z]/.test(np) || !/[0-9]/.test(np)) {
    return NextResponse.json({ error: "新密码需同时包含字母与数字" }, { status: 400 });
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
