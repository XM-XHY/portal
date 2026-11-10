import { NextRequest, NextResponse } from "next/server";
import { getLeads, addLead, updateLead, appendAudit } from "@/lib/store";
import { getAdminFromCookie, clientIp } from "@/lib/session";
import { can } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

// 访客提交线索（公开，无需登录）
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  // 探索页搜索通道降级为示例数据时，前端会禁用留资并带上 demo 标记，
  // 服务端也拒绝这类提交，避免把「假检索结果」当成真实商机入库
  if (body.demo) {
    return NextResponse.json({ error: "当前为演示示例数据，暂不可提交线索，请稍后再试" }, { status: 400 });
  }
  const rl = await rateLimit(`lead:${clientIp(req)}`, 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `提交过于频繁，请 ${rl.retryAfter} 秒后再试` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }
  const name = String(body.name || "").trim();
  const phone = String(body.phone || "").trim();
  const company = String(body.company || "").trim();
  const query = String(body.query || "").trim().slice(0, 100);
  if (!name || !phone) {
    return NextResponse.json({ error: "请填写称呼与手机号" }, { status: 400 });
  }
  if (!/^[0-9+\-\s]{6,20}$/.test(phone)) {
    return NextResponse.json({ error: "手机号格式不正确" }, { status: 400 });
  }
  const lead = await addLead({ name, phone, company, query });
  return NextResponse.json({ ok: true, id: lead.id });
}

// 列表：支持关键词搜索、状态筛选、分页
export async function GET(req: NextRequest) {
  const admin = await getAdminFromCookie();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!can(admin, "leads.view")) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const status = searchParams.get("status") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);

  let leads = await getLeads();
  if (q) {
    leads = leads.filter((l) =>
      `${l.name}${l.phone}${l.company}${l.query}`.toLowerCase().includes(q)
    );
  }
  if (status) {
    leads = leads.filter((l) => (l.status || "new") === status);
  }

  const total = leads.length;
  const items = leads.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return NextResponse.json({ items, total, page, pageSize: PAGE_SIZE });
}

// 更新：标记跟进状态 / 备注
export async function PATCH(req: NextRequest) {
  const admin = await getAdminFromCookie();
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!can(admin, "leads.view")) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const { id, status, note } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  const updated = await updateLead(id, { status, note });
  if (!updated) return NextResponse.json({ error: "未找到线索" }, { status: 404 });
  await appendAudit({
    actor: admin.username,
    action: "lead.update",
    target: `lead:${id}`,
    ip: clientIp(req),
    detail: status ? `status=${status}${note ? " note=1" : ""}` : "note=1",
  });
  return NextResponse.json({ ok: true, lead: updated });
}
