import { NextRequest, NextResponse } from "next/server";
import { getShareSnapshot } from "@/lib/schedule";

export const dynamic = "force-dynamic";

/** 公开读取分享快照（无需登录） */
export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const state = await getShareSnapshot(params.token);
  if (!state)
    return NextResponse.json(
      { error: "分享链接不存在、已过期或已被管理员吊销" },
      { status: 404 }
    );
  return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
}
