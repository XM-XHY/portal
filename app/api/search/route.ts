import { NextRequest, NextResponse } from "next/server";
import { searchWeb } from "@/lib/search";
import { addSearchLog } from "@/lib/store";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/session";

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

  // 共享存储限流：同一 IP 3 秒至多 1 次（多实例同时生效）
  const ip = clientIp(req);
  const rl = await rateLimit(`search:${ip}`, 1, 3000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `操作过于频繁，请 ${rl.retryAfter} 秒后再试` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const data = await searchWeb(q);
  // 记录搜索行为用于获客分析（不阻塞主流程）
  addSearchLog(q, ip).catch(() => {});
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
