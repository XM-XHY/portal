import { NextResponse } from "next/server";
import { templateCsv, type TmplKind } from "@/lib/schedule";

export const dynamic = "force-dynamic";

const KINDS: TmplKind[] = ["teachers", "classes", "subjects", "rooms", "oldsched"];

export async function GET(req: Request) {
  const kind = (new URL(req.url).searchParams.get("kind") || "") as TmplKind;
  if (!KINDS.includes(kind))
    return NextResponse.json({ error: "未知模板类型" }, { status: 400 });
  const csv = templateCsv(kind);
  const fname = encodeURIComponent(`排课导入模板_${kind}.csv`);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${fname}`,
    },
  });
}
