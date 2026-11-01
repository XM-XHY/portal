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

/* ============== 只读分享快照 ============== */

export async function saveShareSnapshot(state: import("./schedule-engine").SchedState, title: string): Promise<string> {
  const token = newId("sh").replace(/[^a-zA-Z0-9]/g, "").slice(0, 16) || Math.random().toString(36).slice(2, 12);
  const list = await getContents();
  const item: ContentItem = {
    id: token,
    type: SCHED_SHARE_TYPE,
    title: title || "课表分享",
    tag: "",
    summary: "",
    body: JSON.stringify({ state, title, createdAt: new Date().toISOString() }),
    icon: "🔗",
    tags: [],
    client: "",
    industry: "",
    result: "",
    at: new Date().toISOString().slice(0, 10),
    order: 1,
  };
  list.unshift(item);
  await saveContents(list);
  return token;
}

export async function getShareSnapshot(token: string): Promise<import("./schedule-engine").SchedState | null> {
  const list = await getContents(SCHED_SHARE_TYPE);
  const item = list.find((x) => x.id === token);
  if (!item?.body) return null;
  try {
    return (JSON.parse(item.body) as { state: import("./schedule-engine").SchedState }).state;
  } catch {
    return null;
  }
}
