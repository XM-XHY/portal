import { NextRequest, NextResponse } from "next/server";
import { getAdminFromCookie } from "@/lib/session";
import {
  listHubMaterials,
  getHubMaterial,
  deleteHubMaterial,
} from "@/lib/hub-materials";
import { appendAudit } from "@/lib/store";
import { clientIp } from "@/lib/session";

export const dynamic = "force-dynamic";

/** 我的材料列表（仅当前登录账号） */
export async function GET(req: NextRequest) {
  const me = await getAdminFromCookie();
  if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const m = await getHubMaterial(id, me.username);
    if (!m) return NextResponse.json({ error: "材料不存在" }, { status: 404 });
    return NextResponse.json({ item: m }, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json(
    { items: await listHubMaterials(me.username) },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/** 删除自己的材料 ?id= */
export async function DELETE(req: NextRequest) {
  const me = await getAdminFromCookie();
  if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  const ok = await deleteHubMaterial(id, me.username);
  if (!ok) return NextResponse.json({ error: "材料不存在" }, { status: 404 });
  await appendAudit({
    actor: me.username,
    action: "hub.material.delete",
    target: `material:${id}`,
    ip: clientIp(req),
  });
  return NextResponse.json({ ok: true });
}
