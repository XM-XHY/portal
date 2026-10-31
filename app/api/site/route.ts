import { NextRequest, NextResponse } from "next/server";
import { getSite, updateSite, appendAudit, type SiteInfo } from "@/lib/store";
import { getAdminFromCookie, clientIp } from "@/lib/session";
import { can } from "@/lib/auth";

export const dynamic = "force-dynamic";

const FIELDS: (keyof SiteInfo)[] = [
  "companyName",
  "slogan",
  "contactName",
  "phone",
  "email",
  "address",
  "icp",
];

export async function GET() {
  return NextResponse.json(await getSite());
}

export async function PUT(req: NextRequest) {
  const admin = await getAdminFromCookie();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!can(admin.role, "settings.manage")) {
    return NextResponse.json({ error: "无权限：需要系统设置权限" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const patch: Partial<SiteInfo> = {};
  for (const f of FIELDS) {
    if (typeof body[f] === "string") patch[f] = body[f].slice(0, 200);
  }
  const site = await updateSite(patch);
  await appendAudit({
    actor: admin.username,
    action: "site.update",
    target: "site",
    ip: clientIp(req),
    detail: Object.keys(patch).join(","),
  });
  return NextResponse.json({ ok: true, site });
}
