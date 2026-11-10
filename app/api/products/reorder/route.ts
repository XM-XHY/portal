import { NextRequest, NextResponse } from "next/server";
import { getContents, saveContents, appendAudit } from "@/lib/store";
import { getAdminFromCookie, clientIp } from "@/lib/session";
import { can } from "@/lib/auth";
import { isProductKind } from "@/lib/products";

export const dynamic = "force-dynamic";

/**
 * 调整产品/解决方案的展示位置。
 * body: { ids: string[] } —— 按期望的展示顺序排列的 id 列表，服务端依次编号 1..n。
 */
export async function POST(req: NextRequest) {
  const admin = await getAdminFromCookie();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!can(admin, "content.manage")) {
    return NextResponse.json({ error: "无权限，需要内容管理权限" }, { status: 403 });
  }

  const b = await req.json().catch(() => ({}));
  const ids: unknown = b?.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "缺少 ids" }, { status: 400 });
  }
  const clean = ids.filter((x): x is string => typeof x === "string").slice(0, 200);
  if (!clean.length) return NextResponse.json({ error: "ids 格式不正确" }, { status: 400 });

  const list = await getContents();
  const rank = new Map<string, number>();
  clean.forEach((id, i) => {
    if (!rank.has(id)) rank.set(id, i + 1);
  });

  let changed = 0;
  for (const c of list) {
    if (!isProductKind(c.type)) continue;
    const next = rank.get(c.id);
    if (next !== undefined && c.order !== next) {
      c.order = next;
      changed += 1;
    }
  }

  if (changed === 0) return NextResponse.json({ ok: true, changed: 0 });

  await saveContents(list);
  await appendAudit({
    actor: admin.username,
    action: "product.reorder",
    target: "product:center",
    ip: clientIp(req),
    detail: `${clean.length} 项排序更新（${clean.slice(0, 3).join(",")}${clean.length > 3 ? "…" : ""}）`,
  });

  return NextResponse.json({ ok: true, changed });
}
