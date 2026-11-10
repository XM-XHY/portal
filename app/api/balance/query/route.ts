import { NextRequest, NextResponse } from "next/server";
import { lookupClass } from "@/lib/balance-lookup";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * 家长查询：?code=查询码&name=学生姓名
 * 只返回班级与标题，不返回其他学生信息。
 * 限流：同 IP 每分钟最多 30 次（共享存储，多实例生效）。
 */
export async function GET(req: NextRequest) {
  const rl = await rateLimit(`balq:${clientIp(req)}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `查询过于频繁，请 ${rl.retryAfter} 秒后再试` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const code = req.nextUrl.searchParams.get("code") || "";
  const name = req.nextUrl.searchParams.get("name") || "";
  const r = await lookupClass(code, name);
  if (!r.ok) {
    const status = r.error.includes("格式") || r.error.includes("请输入") ? 400 : 404;
    return NextResponse.json({ error: r.error }, { status });
  }
  return NextResponse.json({
    ok: true,
    title: r.title,
    name: r.name,
    className: r.className,
    duplicate: r.duplicate,
  });
}
