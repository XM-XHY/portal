import { NextRequest, NextResponse } from "next/server";
import {
  getAdmins,
  addAdmin,
  removeAdmin,
  setAdminPassword,
  setAdminRole,
  setAdminPerms,
  appendAudit,
} from "@/lib/store";
import { getAdminFromCookie, clientIp } from "@/lib/session";
import { can } from "@/lib/auth";
import { isInitialPasswordHash, initialAdminPassword } from "@/lib/data/defaults";
import type { Role } from "@/lib/data/types";

export const dynamic = "force-dynamic";

const ROLES: Role[] = ["super", "editor", "lead", "viewer", "employee", "teacher"];

/** 统一鉴权：仅持有 users.manage 的超管可管理后台账号 */
async function guard() {
  const admin = await getAdminFromCookie();
  if (!admin) return { admin: null, error: NextResponse.json({ error: "未登录" }, { status: 401 }) };
  if (!can(admin, "users.manage")) {
    return { admin: null, error: NextResponse.json({ error: "无权限" }, { status: 403 }) };
  }
  return { admin, error: null };
}

function validUsername(v: unknown): string {
  const s = String(v || "").trim();
  return /^[a-zA-Z0-9_\-]{2,40}$/.test(s) ? s : "";
}

function validPassword(v: unknown): string | null {
  const s = String(v || "");
  if (s.length < 8 || s.length > 128) return null;
  if (!/[A-Za-z]/.test(s) || !/[0-9]/.test(s)) return null;
  if (s === initialAdminPassword()) return null;
  return s;
}

/** 后台账号列表（含 id，供改角色/重置密码/删除） */
export async function GET() {
  const g = await guard();
  if (g.error) return g.error;
  const admins = await getAdmins();
  return NextResponse.json(
    admins.map((a) => ({
      id: a.id,
      username: a.username,
      role: a.role,
      mustChangePassword: isInitialPasswordHash(a.pwHash),
      perms: a.perms ?? undefined,
    })),
    { headers: { "Cache-Control": "no-store" } }
  );
}

/** 新增后台账号 { username, password, role } */
export async function POST(req: NextRequest) {
  const g = await guard();
  if (g.error) return g.error;

  const b = await req.json().catch(() => ({}));
  const username = validUsername(b?.username);
  const password = validPassword(b?.password);
  const role = ROLES.includes(b?.role) ? (b.role as Role) : "viewer";
  if (!username) return NextResponse.json({ error: "账号需为 2-40 位字母/数字/下划线/中划线" }, { status: 400 });
  if (!password) return NextResponse.json({ error: "密码需 8-128 位、含字母与数字，且不能是初始口令" }, { status: 400 });

  // 逐账号权限覆盖：仅超管可指定；未传则沿用角色默认
  let perms: string[] | undefined;
  if (Array.isArray(b?.perms)) {
    perms = (b.perms as unknown[]).filter((x) => typeof x === "string");
  }

  try {
    const created = await addAdmin({ username, password, role, perms });
    await appendAudit({
      actor: g.admin!.username,
      action: "admin.create",
      target: `admin:${created.id}`,
      ip: clientIp(req),
      detail: `${username} / ${role}`,
    });
    return NextResponse.json({ ok: true, item: { id: created.id, username, role } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "创建失败" }, { status: 400 });
  }
}

/** 改角色 { id, role } 或重置密码 { id, password } */
export async function PATCH(req: NextRequest) {
  const g = await guard();
  if (g.error) return g.error;

  const b = await req.json().catch(() => ({}));
  const id = String(b?.id || "").trim();
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });

  const all = await getAdmins();
  const target = all.find((a) => a.id === id);
  if (!target) return NextResponse.json({ error: "账号不存在" }, { status: 404 });
  if (target.id === g.admin!.id && b.role) {
    return NextResponse.json({ error: "不能修改自己的角色，请由另一位超管操作" }, { status: 400 });
  }

  // 改角色
  if (b.role !== undefined) {
    if (!ROLES.includes(b.role)) {
      return NextResponse.json({ error: "角色不合法" }, { status: 400 });
    }
    const role = b.role as Role;
    // 不允许把最后一个超管降级，否则后台将永久失去账号管理能力
    if (target.role === "super" && role !== "super") {
      const supers = all.filter((a) => a.role === "super").length;
      if (supers <= 1) return NextResponse.json({ error: "不能降级最后一个超级管理员" }, { status: 400 });
    }
    const ok = await setAdminRole(id, role);
    if (!ok) return NextResponse.json({ error: "修改角色失败" }, { status: 500 });
    await appendAudit({
      actor: g.admin!.username,
      action: "admin.role",
      target: `admin:${id}`,
      ip: clientIp(req),
      detail: `${target.username}: ${target.role} → ${role}`,
    });
    return NextResponse.json({ ok: true });
  }

  // 修改逐账号权限覆盖
  if (b.perms !== undefined) {
    // 不允许移除自己的「用户与角色」权限，否则将永久失去账号管理能力
    if (target.id === g.admin!.id && b.perms !== null) {
      const list = Array.isArray(b.perms) ? (b.perms as unknown[]).filter((x) => typeof x === "string") : [];
      if (!list.includes("users.manage")) {
        return NextResponse.json(
          { error: "不能移除自己的「用户与角色」权限，否则将失去账号管理能力" },
          { status: 400 }
        );
      }
    }
    const perms = b.perms === null
      ? null
      : (Array.isArray(b.perms) ? (b.perms as unknown[]).filter((x) => typeof x === "string") : null);
    const ok = await setAdminPerms(id, perms);
    if (!ok) {
      return NextResponse.json(
        {
          error:
            "修改权限失败；若提示 perms 列不存在，请先在 Supabase SQL Editor 执行 supabase/add-perms-column.sql 迁移脚本。",
        },
        { status: 400 }
      );
    }
    await appendAudit({
      actor: g.admin!.username,
      action: "admin.perms",
      target: `admin:${id}`,
      ip: clientIp(req),
      detail: `${target.username}: ${perms === null ? "恢复角色默认" : perms.join(",")}`,
    });
    return NextResponse.json({ ok: true });
  }

  // 重置密码
  if (b.password !== undefined) {
    const password = validPassword(b.password);
    if (!password) return NextResponse.json({ error: "密码需 8-128 位、含字母与数字，且不能是初始口令" }, { status: 400 });
    const ok = await setAdminPassword(id, password);
    if (!ok) return NextResponse.json({ error: "重置密码失败" }, { status: 500 });
    await appendAudit({
      actor: g.admin!.username,
      action: "admin.reset",
      target: `admin:${id}`,
      ip: clientIp(req),
      detail: `重置 ${target.username} 的口令`,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "请提供 role 或 password" }, { status: 400 });
}

/** 删除账号 ?id= */
export async function DELETE(req: NextRequest) {
  const g = await guard();
  if (g.error) return g.error;

  const id = req.nextUrl.searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  const all = await getAdmins();
  const target = all.find((a) => a.id === id);
  if (!target) return NextResponse.json({ error: "账号不存在" }, { status: 404 });
  if (target.id === g.admin!.id) {
    return NextResponse.json({ error: "不能删除当前登录的账号" }, { status: 400 });
  }
  if (target.role === "super" && all.filter((a) => a.role === "super").length <= 1) {
    return NextResponse.json({ error: "不能删除最后一个超级管理员" }, { status: 400 });
  }

  const ok = await removeAdmin(id);
  if (!ok) return NextResponse.json({ error: "删除失败" }, { status: 500 });
  await appendAudit({
    actor: g.admin!.username,
    action: "admin.delete",
    target: `admin:${id}`,
    ip: clientIp(req),
    detail: `${target.username} / ${target.role}`,
  });
  return NextResponse.json({ ok: true });
}
