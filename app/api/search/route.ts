import { NextRequest, NextResponse } from "next/server";
import { searchWeb } from "@/lib/search";
import { addSearchLog } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() || "";

  if (!q) {
    return NextResponse.json(
      { error: "缺少查询参数 q" },
      { status: 400 }
    );
  }
  if (q.length > 100) {
    return NextResponse.json(
      { error: "关键词过长（上限 100 字符）" },
      { status: 400 }
    );
  }

  // 简单限流：同一 IP 10 秒至多 1 次（演示用，生产建议用 Redis）
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local";
  const now = Date.now();
  const last = (globalThis as any).__lastSearch?.[ip] || 0;
  if (now - last < 3000) {
    return NextResponse.json(
      { error: "操作过于频繁，请稍后再试" },
      { status: 429 }
    );
  }
  (globalThis as any).__lastSearch = {
    ...((globalThis as any).__lastSearch || {}),
    [ip]: now,
  };

  const data = await searchWeb(q);
  // 记录搜索行为用于获客分析（不阻塞主流程）
  addSearchLog(q, ip).catch(() => {});
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
