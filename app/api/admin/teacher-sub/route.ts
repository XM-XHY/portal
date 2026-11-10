import { NextRequest, NextResponse } from "next/server";
import { getAdminFromCookie, clientIp } from "@/lib/session";
import { can } from "@/lib/auth";
import { appendAudit } from "@/lib/store";
import {
  listSubscribers,
  listAdminLogs,
  grantSubscription,
  disableSubscription,
  type AdminLog,
} from "@/lib/teacher-sub";

export const dynamic = "force-dynamic";

/**
 * 教师工作台订阅管理（需登录 + users.manage）。
 *
 * GET  ?kw=账号关键字        → 订阅用户列表 + 最近操作日志
 * POST body.action=grant     → 手动开通/延长使用期限
 *      body.action=disable   → 停用权限
 *
 * 云函数 ent 的地址与共享密钥只在服务端 lib/teacher-sub.ts 中使用，
 * 浏览器只与本站此路由交互。
 */

/** 账号：2-64 位字母/数字/下划线/中划线/@/点（与教师工作台账号规则一致） */
const ACCOUNT_RE = /^[a-zA-Z0-9_\-@.]{2,64}$/;
/** 合法 ISO 日期：YYYY-MM-DD，或带时间与时区的完整 ISO 串 */
const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const NOTE_MAX = 200;

function guard(admin: Awaited<ReturnType<typeof getAdminFromCookie>>) {
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!can(admin, "users.manage")) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  return null;
}

/** 备注校验：拒绝超过 200 字，不做静默截断。 */
function parseNote(v: unknown): { value?: string; error?: string } {
  if (v === undefined || v === null) return {};
  const s = String(v).trim();
  if (s.length > NOTE_MAX) return { error: `备注不能超过 ${NOTE_MAX} 字` };
  return { value: s || undefined };
}

export async function GET(req: NextRequest) {
  const admin = await getAdminFromCookie();
  const denied = guard(admin);
  if (denied) return denied;

  const kw = (req.nextUrl.searchParams.get("kw") || "").trim();
  if (kw.length > 64) {
    return NextResponse.json({ error: "搜索关键字过长（最多 64 字）" }, { status: 400 });
  }

  try {
    const users = await listSubscribers(kw || undefined);
    // 操作日志属辅助信息：读取失败时不阻塞订阅列表，页面仍可用。
    let logs: AdminLog[] = [];
    try {
      logs = await listAdminLogs(100);
    } catch {
      logs = [];
    }
    return NextResponse.json({ ok: true, users, logs });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "查询订阅列表失败" }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await getAdminFromCookie();
  const denied = guard(admin);
  if (denied) return denied;

  const b = await req.json().catch(() => ({}));
  const action = String(b?.action || "").trim();
  const account = String(b?.account || "").trim();

  if (!ACCOUNT_RE.test(account)) {
    return NextResponse.json(
      { error: "账号格式不合法（需为 2-64 位字母/数字/下划线/中划线/@/点）" },
      { status: 400 }
    );
  }

  if (action !== "grant" && action !== "disable") {
    return NextResponse.json({ error: "未知操作（仅支持 grant / disable）" }, { status: 400 });
  }

  const note = parseNote(b?.note);
  if (note.error) return NextResponse.json({ error: note.error }, { status: 400 });

  try {
    if (action === "grant") {
      let days: number | undefined;
      if (b.days !== undefined && b.days !== null && b.days !== "") {
        const raw = b.days;
        const n = typeof raw === "number" || typeof raw === "string" ? Number(raw) : NaN;
        if (!Number.isInteger(n) || n < 1 || n > 3650) {
          return NextResponse.json({ error: "天数需为 1-3650 的整数" }, { status: 400 });
        }
        days = n;
      }

      let until: string | undefined;
      if (b.until !== undefined && b.until !== null && String(b.until).trim() !== "") {
        const s = String(b.until).trim();
        if (!ISO_DATE_RE.test(s) || Number.isNaN(Date.parse(s))) {
          return NextResponse.json(
            { error: "到期日需为合法 ISO 日期（如 2026-12-31 或 2026-12-31T00:00:00Z）" },
            { status: 400 }
          );
        }
        until = s;
      }

      const user = await grantSubscription(account, { days, until, note: note.value });
      const parts = ["手动开通/延长使用期限"];
      if (days !== undefined) parts.push(`天数 ${days}`);
      if (until !== undefined) parts.push(`到期日 ${until}`);
      if (note.value) parts.push(`备注：${note.value}`);
      await appendAudit({
        actor: admin!.username,
        action: "teacher_sub.grant",
        target: account,
        ip: clientIp(req),
        detail: parts.join(" / "),
      });
      return NextResponse.json({ ok: true, user });
    }

    // action === "disable"
    const user = await disableSubscription(account, note.value);
    const parts = ["停用教师工作台订阅权限"];
    if (note.value) parts.push(`备注：${note.value}`);
    await appendAudit({
      actor: admin!.username,
      action: "teacher_sub.disable",
      target: account,
      ip: clientIp(req),
      detail: parts.join(" / "),
    });
    return NextResponse.json({ ok: true, user });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "操作失败" }, { status: 502 });
  }
}
