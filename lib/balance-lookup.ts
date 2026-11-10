import { getContent } from "@/lib/store";

/**
 * 分班查询的公共查询逻辑：H5 页（/balance/query）与公众号消息接口共用。
 * 只返回班级与标题，绝不返回其他学生的信息。
 */
export type LookupResult =
  | { ok: true; title: string; name: string; className: string; duplicate?: string[] }
  | { ok: false; error: string };

export async function lookupClass(codeRaw: string, nameRaw: string): Promise<LookupResult> {
  const code = (codeRaw || "").trim().toUpperCase();
  const name = (nameRaw || "").trim();
  if (!/^[A-Z0-9]{4,10}$/.test(code)) return { ok: false, error: "查询码格式不正确" };
  if (!name || name.length > 40) return { ok: false, error: "请输入学生姓名" };

  let item = null;
  for (const cand of [`bal_${code}`, `bal_${code}#1`]) {
    item = await getContent(cand);
    if (item) break;
  }
  if (!item || item.type !== "balance_pub") {
    return { ok: false, error: "查询码不存在，请确认后重试" };
  }

  let data: { title?: string; entries?: { className: string; names: string[] }[]; disabled?: boolean };
  try {
    data = JSON.parse(item.body);
  } catch {
    return { ok: false, error: "查询数据异常" };
  }
  if (data.disabled) {
    return { ok: false, error: "该查询已被老师停用，请联系班主任获取最新查询码" };
  }

  const hits: string[] = [];
  for (const e of data.entries || []) {
    if ((e.names || []).some((n) => n === name)) hits.push(e.className);
  }
  if (!hits.length) {
    return {
      ok: false,
      error: `未在「${item.title}」中找到「${name}」，请确认姓名或联系老师`,
    };
  }

  return {
    ok: true,
    title: item.title,
    name,
    className: hits[0],
    duplicate: hits.length > 1 ? hits : undefined,
  };
}
