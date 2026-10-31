import { NextRequest, NextResponse } from "next/server";
import { getLeads, appendAudit } from "@/lib/store";
import { getAdminFromCookie, clientIp } from "@/lib/session";
import { can } from "@/lib/auth";

export const dynamic = "force-dynamic";

function toCsv(leads: Awaited<ReturnType<typeof getLeads>>): string {
  const header = ["提交时间", "称呼", "手机号", "公司", "关联关键词", "状态", "备注"];
  const rows = leads.map((l) => [
    new Date(l.at).toLocaleString("zh-CN"),
    l.name,
    l.phone,
    l.company,
    l.query,
    l.status === "contacted" ? "已联系" : "新线索",
    l.note || "",
  ]);
  const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  return [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
}

export async function GET(req: NextRequest) {
  const admin = await getAdminFromCookie();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!can(admin.role, "leads.export")) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const status = searchParams.get("status") || "";

  let leads = await getLeads();
  if (q) {
    leads = leads.filter((l) =>
      `${l.name}${l.phone}${l.company}${l.query}`.toLowerCase().includes(q)
    );
  }
  if (status) {
    leads = leads.filter((l) => (l.status || "new") === status);
  }

  await appendAudit({
    actor: admin.username,
    action: "lead.export",
    target: "leads",
    ip: clientIp(req),
    detail: `${leads.length} 条`,
  });

  const csv = "﻿" + toCsv(leads); // BOM 兼容 Excel
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="leads.csv"',
    },
  });
}
