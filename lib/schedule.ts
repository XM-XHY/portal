// 学校排课系统：服务端读写（复用 contents 表，零 DDL）。
// 纯引擎（类型/模板/解析/排课/三视图/Excel 构建）见 lib/schedule-engine.ts（客户端安全）。

export * from "./schedule-engine";

import type { ContentItem, ContentType } from "@/lib/data/types";
import { getContents, saveContents, newId } from "@/lib/store";
import { emptyState } from "./schedule-engine";

export const SCHED_TYPE: ContentType = "sched";
export const SCHED_SHARE_TYPE: ContentType = "sched_share";
const SCHED_MAIN_ID = "sched-main";

/** 读取排课主数据（服务端） */
export async function getScheduleState(): Promise<import("./schedule-engine").SchedState> {
  const list = await getContents(SCHED_TYPE);
  const item = list.find((x) => x.id === SCHED_MAIN_ID);
  if (!item || !item.body) return emptyState();
  try {
    const parsed = JSON.parse(item.body) as import("./schedule-engine").SchedState;
    return { ...emptyState(), ...parsed, rules: { ...emptyState().rules, ...parsed.rules } };
  } catch {
    return emptyState();
  }
}

/** 保存排课主数据（服务端） */
export async function saveScheduleState(state: import("./schedule-engine").SchedState): Promise<void> {
  state.updatedAt = new Date().toISOString();
  const list = await getContents();
  const idx = list.findIndex((x) => x.id === SCHED_MAIN_ID && x.type === SCHED_TYPE);
  const item: ContentItem = {
    id: SCHED_MAIN_ID,
    type: SCHED_TYPE,
    title: "排课主数据",
    tag: "",
    summary: "",
    body: JSON.stringify(state),
    icon: "🗓️",
    tags: [],
    client: "",
    industry: "",
    result: "",
    at: new Date().toISOString().slice(0, 10),
    order: 1,
  };
  if (idx >= 0) list[idx] = item;
  else list.unshift(item);
  await saveContents(list);
}

/* ============== 只读分享快照（支持有效期与吊销） ============== */

export type ShareMeta = {
  token: string;
  title: string;
  createdAt: string;
  /** 到期时间 ISO；历史记录没有该字段时视为永久有效 */
  expiresAt?: string;
  revoked?: boolean;
  owner?: string;
  state?: import("./schedule-engine").SchedState;
};

export type ShareSummary = {
  token: string;
  title: string;
  createdAt: string;
  expiresAt?: string;
  expired: boolean;
  revoked: boolean;
  owner?: string;
};

function parseShare(item: ContentItem | undefined): ShareMeta | null {
  if (!item?.body) return null;
  try {
    const m = JSON.parse(item.body) as ShareMeta;
    return m && m.state ? { ...m, token: item.id, title: m.title || item.title } : null;
  } catch {
    return null;
  }
}

export function shareIsActive(m: ShareMeta): boolean {
  if (m.revoked) return false;
  if (m.expiresAt && new Date(m.expiresAt).getTime() < Date.now()) return false;
  return true;
}

/** 创建分享快照。默认 30 天有效； expiresDays 可传 1-365。 */
export async function saveShareSnapshot(
  state: import("./schedule-engine").SchedState,
  title: string,
  opts: { owner?: string; expiresDays?: number } = {}
): Promise<string> {
  const token = newId("sh").replace(/[^a-zA-Z0-9]/g, "").slice(0, 16) || Math.random().toString(36).slice(2, 12);
  const now = new Date();
  const days = Math.min(365, Math.max(1, Number(opts.expiresDays) || 30));
  const meta: ShareMeta = {
    token,
    title: title || "课表分享",
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + days * 86400_000).toISOString(),
    revoked: false,
    owner: opts.owner || "",
    state,
  };
  const item: ContentItem = {
    id: token,
    type: SCHED_SHARE_TYPE,
    title: meta.title,
    tag: "",
    summary: `${days} 天有效`,
    body: JSON.stringify(meta),
    icon: "🔗",
    tags: [],
    client: opts.owner || "",
    industry: "",
    result: "",
    at: now.toISOString().slice(0, 10),
    order: 1,
  };
  // 只 upsert 这一条，避免全量写回时把其它实例刚写入的数据覆盖掉
  await saveContents([item]);
  return token;
}

/** 读取有效快照；已过期 / 已吊销 / 不存在一律返回 null */
export async function getShareSnapshot(token: string): Promise<import("./schedule-engine").SchedState | null> {
  const item = (await getContents(SCHED_SHARE_TYPE)).find((x) => x.id === token);
  const meta = parseShare(item);
  if (!meta || !shareIsActive(meta)) return null;
  return meta.state!;
}

/** 后台列出全部分享（不含课表正文） */
export async function listShares(): Promise<ShareSummary[]> {
  const list = await getContents(SCHED_SHARE_TYPE);
  return list
    .map((item) => ({ item, meta: parseShare(item) }))
    .filter((x): x is { item: ContentItem; meta: ShareMeta } => !!x.meta)
    .map(({ meta }) => ({
      token: meta.token,
      title: meta.title,
      createdAt: meta.createdAt,
      expiresAt: meta.expiresAt,
      expired: !!meta.expiresAt && new Date(meta.expiresAt).getTime() < Date.now(),
      revoked: !!meta.revoked,
      owner: meta.owner,
    }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** 吊销 / 恢复分享链接 */
export async function setShareRevoked(token: string, revoked: boolean): Promise<boolean> {
  const item = (await getContents(SCHED_SHARE_TYPE)).find((x) => x.id === token);
  const meta = parseShare(item);
  if (!item || !meta) return false;
  meta.revoked = revoked;
  await saveContents([{ ...item, body: JSON.stringify(meta) }]);
  return true;
}
