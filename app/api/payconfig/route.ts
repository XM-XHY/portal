import { NextRequest, NextResponse } from "next/server";
import { getAdminFromCookie } from "@/lib/session";
import { can } from "@/lib/auth";
import { getPayConfig, savePayConfig, defaultPayConfig } from "@/lib/payconfig";

export const dynamic = "force-dynamic";

/** 公开读取：前端支付门禁（PayGate）与首页卡片需要 */
export async function GET() {
  return NextResponse.json(await getPayConfig());
}

/** 仅管理员可写（settings.manage = 超级管理员） */
export async function POST(req: NextRequest) {
  const me = await getAdminFromCookie();
  if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!can(me, "settings.manage"))
    return NextResponse.json({ error: "无权限" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "参数错误" }, { status: 400 });

  const prev = await getPayConfig();
  const next = defaultPayConfig();

  // 收款二维码（data URL 或外链），限制长度避免超大字段
  const qr = typeof body.qrImageUrl === "string" ? body.qrImageUrl.slice(0, 3_000_000) : prev.qrImageUrl;
  next.qrImageUrl = qr;
  next.qrNote = typeof body.qrNote === "string" ? body.qrNote.slice(0, 60) : prev.qrNote;

  // 各产品付费项：金额做数值化与边界处理
  const items: Record<string, { paid: boolean; amount: number }> = {};
  if (body.items && typeof body.items === "object") {
    for (const [k, v] of Object.entries(body.items as Record<string, any>)) {
      if (!k) continue;
      const paid = !!v?.paid;
      let amount = Number(v?.amount) || 0;
      if (amount < 0) amount = 0;
      if (amount > 1_000_000) amount = 1_000_000;
      // 仅保留「已开启付费」或「金额>0」的条目，避免堆积无效数据
      if (paid || amount > 0) items[k] = { paid, amount: Math.round(amount * 100) / 100 };
    }
  }
  next.items = items;

  await savePayConfig(next);
  return NextResponse.json({ ok: true, config: next });
}
