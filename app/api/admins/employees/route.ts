import { NextRequest, NextResponse } from "next/server";
import { getAdmins, addAdmin, removeAdmin, setAdminPassword, appendAudit } from "@/lib/store";
import { getAdminFromCookie, clientIp } from "@/lib/session";
import { can } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * 员工账号管理（企业知识中枢 /hub 的登录账号）。
 * 员工存放在 admins 表中，role = "employee"，不拥有任何后台权限；
 * 仅持有 users.manage 权限的管理员可增删改。
 */

/** 员工账号列表 */
export async function GET() {
  const admin = await getAdminFromCookie();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!can(admin.role, "users.manage")) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const all = await getAdmins();
  return NextResponse.json(
    all
      .filter((a) => a.role === "employee")
      .map((a) => ({ id: a.id, username: a.username, role: a.role })),
    { headers: { "Cache-Control": "no-store" } }
  );
}

/** 新增员工账号 { username, password } */
export async function POST(req: NextRequest) {
  const admin = await getAdminFromCookie();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!can(admin.role, "users.manage")) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const b = await req.json().catch(() => ({}));
  const username = String(b?.username || "").trim();
  const password = String(b?.password || "");
  if (!/^[a-zA-Z0-9_\-]{2,40}$/.test(username)) {
    return NextResponse.json(
      { error: "账号需为 2-40 位字母/数字/下划线/中划线" },
      { status: 400 }
    );
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "密码至少 8 位" }, { status: 400 });
  }

  try {
    const created = await addAdmin({ username, password, role: "employee" });
    await appendAudit({
      actor: admin.username,
      action: "employee.create",
      target: `admin:${created.id}`,
      ip: clientIp(req),
      detail: username,
    });
    return NextResponse.json({ ok: true, item: { id: created.id, username: created.username } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "创建失败" },
      { status: 400 }
    );
  }
}

/** 重置员工密码 { id, password } */
export async function PUT(req: NextRequest) {
  const admin = await getAdminFromCookie();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!can(admin.role, "users.manage")) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const b = await req.json().catch(() => ({}));
  const id = String(b?.id || "");
  const password = String(b?.password || "");
  if (!id || password.length < 8) {
    return NextResponse.json({ error: "缺少 id 或密码不足 8 位" }, { status: 400 });
  }

  const target = (await getAdmins()).find((a) => a.id === id && a.role === "employee");
  if (!target) return NextResponse.json({ error: "员工账号不存在" }, { status: 404 });

  const ok = await setAdminPassword(id, password);
  if (!ok) return NextResponse.json({ error: "重置失败" }, { status: 500 });

  await appendAudit({
    actor: admin.username,
    action: "employee.reset",
    target: `admin:${id}`,
    ip: clientIp(req),
    detail: target.username,
  });
  return NextResponse.json({ ok: true });
}

/** 删除员工账号 ?id= */
export async function DELETE(req: NextRequest) {
  const admin = await getAdminFromCookie();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!can(admin.role, "users.manage")) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });

  const target = (await getAdmins()).find((a) => a.id === id && a.role === "employee");
  if (!target) return NextResponse.json({ error: "员工账号不存在" }, { status: 404 });

  const ok = await removeAdmin(id);
  if (!ok) return NextResponse.json({ error: "删除失败" }, { status: 500 });

  await appendAudit({
    actor: admin.username,
    action: "employee.delete",
    target: `admin:${id}`,
    ip: clientIp(req),
    detail: target.username,
  });
  return NextResponse.json({ ok: true });
}
