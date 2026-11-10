import { NextRequest, NextResponse } from "next/server";
import { getContent, getContents, saveContents, deleteContents, appendAudit } from "@/lib/store";
import { getAdminFromCookie } from "@/lib/session";
import { can } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Snapshot = {
  title?: string;
  entries?: { className: string; names: string[] }[];
  at?: string;
  manageKey?: string;
  disabled?: boolean;
  /** 发布者账号；旧记录没有该字段，只能凭 manageKey 管理 */
  owner?: string;
};

type PubRow = {
  code: string;
  title: string;
  count: number;
  at: string;
  disabled: boolean;
  classes: number;
  /** 兼容旧版：凭管理密钥操作时回传给前端 */
  key: string;
  owner: string;
};

async function readItem(code: string) {
  const id = `bal_${String(code || "").trim().toUpperCase()}`;
  const item = await getContent(id);
  if (!item || item.type !== "balance_pub") return null;
  let data: Snapshot;
  try {
    data = JSON.parse(item.body);
  } catch {
    return null;
  }
  return { item, data };
}

function countOf(data: Snapshot): number {
  return (data.entries || []).reduce((s, e) => s + (e.names?.length || 0), 0);
}

function rowOf(code: string, itemTitle: string, data: Snapshot, key = "", owner = ""): PubRow {
  return {
    code,
    title: itemTitle || data.title || "",
    count: countOf(data),
    at: data.at || "",
    disabled: !!data.disabled,
    classes: (data.entries || []).length,
    key,
    owner,
  };
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * 老师端查询码管理。
 *
 * 鉴权两条路（任一通过即可）：
 *  ① 账号：登录且具备 balance.manage，且该记录 owner === 当前账号（推荐，跨设备可用）；
 *  ② 兼容：旧版 manageKey 匹配（旧记录没有 owner，仍可管理）。
 *
 * - POST { action:"list" }            登录后按账号列出全部发布（无需再传本机密钥）
 * - POST { action:"list", items:[{code,key}] } 兼容旧版本机记录，会合并进结果
 * - POST { action:"rename"|"disable"|"enable"|"delete", code, key?, title? }
 */
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const action = String(b.action || "").trim();
  const ip = clientIp(req);
  const admin = await getAdminFromCookie();
  const canManage = !!admin && can(admin, "balance.manage");
  const actor = admin?.username || "anonymous";

  if (action === "list") {
    const out: PubRow[] = [];
    const seen = new Set<string>();

    // ① 账号归属：服务端按 owner 列出，换设备/清缓存也不会丢
    if (canManage && admin) {
      const all = await getContents("balance_pub");
      for (const item of all) {
        let data: Snapshot;
        try {
          data = JSON.parse(item.body);
        } catch {
          continue;
        }
        const owner = data.owner || item.client || "";
        if (owner !== admin.username) continue;
        const code = item.id.replace(/^bal_/, "").toUpperCase();
        if (seen.has(code)) continue;
        out.push(rowOf(code, item.title, data, data.manageKey || "", owner));
        seen.add(code);
      }
    }

    // ② 兼容：旧版「本机 manageKey」记录（含还没有 owner 的历史发布）
    const items: { code: string; key: string }[] = Array.isArray(b.items) ? b.items.slice(0, 50) : [];
    for (const it of items) {
      const code = String(it.code || "").trim().toUpperCase();
      if (!code || seen.has(code)) continue;
      const got = await readItem(code);
      if (!got) continue;
      if (!got.data.manageKey || got.data.manageKey !== it.key) continue;
      out.push(rowOf(code, got.item.title, got.data, it.key, got.data.owner || ""));
      seen.add(code);
    }

    out.sort((x, y) => (x.at < y.at ? 1 : -1));
    return NextResponse.json({ ok: true, items: out, mode: canManage ? "account" : "key" });
  }

  const code = String(b.code || "").trim().toUpperCase();
  const key = String(b.key || "").trim();
  if (!/^[A-Z0-9]{4,10}$/.test(code)) {
    return NextResponse.json({ error: "查询码格式不正确" }, { status: 400 });
  }

  const got = await readItem(code);
  if (!got) return NextResponse.json({ error: "查询码不存在" }, { status: 404 });

  const owner = got.data.owner || got.item.client || "";
  const byAccount = canManage && !!admin && owner === admin.username;
  const byKey = !!got.data.manageKey && got.data.manageKey === key;
  if (!byAccount && !byKey) {
    return NextResponse.json(
      { error: "无权操作该查询码：请用发布时的账号登录，或提供正确的管理密钥" },
      { status: 403 }
    );
  }

  const audit = (detail: string) =>
    appendAudit({
      actor,
      action: `balance.manage.${action}`,
      target: `balance:${code}`,
      ip,
      detail: `${detail}（${byAccount ? "账号" : "密钥"}）`,
    });

  if (action === "delete") {
    await deleteContents([got.item.id]);
    await audit(`删除查询码 ${code}`);
    return NextResponse.json({ ok: true, deleted: code });
  }

  if (action === "rename") {
    const title = String(b.title || "").trim().slice(0, 60);
    if (!title) return NextResponse.json({ error: "标题不能为空" }, { status: 400 });
    got.data.title = title;
    got.item.title = title;
    got.item.body = JSON.stringify(got.data);
    await saveContents([got.item]);
    await audit(`改标题为「${title}」`);
    return NextResponse.json({ ok: true, title });
  }

  if (action === "disable" || action === "enable") {
    got.data.disabled = action === "disable";
    got.item.body = JSON.stringify(got.data);
    await saveContents([got.item]);
    await audit(got.data.disabled ? "停用查询" : "恢复查询");
    return NextResponse.json({ ok: true, disabled: got.data.disabled });
  }

  return NextResponse.json({ error: "未知操作" }, { status: 400 });
}
