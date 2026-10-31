// 数据访问统一入口（薄委托层）。
// 底层实现由 lib/data/index.ts 按环境变量切换：Supabase 或 JSON 文件。
// 路由/组件继续从 "@/lib/store" 导入，无需关心底层存储。
export * from "./data/types";
export * from "./data/hash";

import { getRepo } from "./data";
import type { SiteInfo, ContentItem, ContentType } from "./data/types";

export async function getSite(): Promise<SiteInfo> {
  return getRepo().getSite();
}

export async function updateSite(patch: Partial<SiteInfo>): Promise<SiteInfo> {
  return getRepo().updateSite(patch);
}

export async function getAdmins() {
  return getRepo().getAdmins();
}

export async function setAdminPassword(id: string, newPw: string): Promise<boolean> {
  return getRepo().setAdminPassword(id, newPw);
}

/** 新增账号（管理员 / 员工），用户名重复时抛错 */
export async function addAdmin(input: {
  username: string;
  password: string;
  role: import("./data/types").Role;
}) {
  return getRepo().addAdmin(input);
}

/** 删除账号（用于移除员工账号） */
export async function removeAdmin(id: string): Promise<boolean> {
  return getRepo().removeAdmin(id);
}

export async function addLead(input: {
  name: string;
  phone: string;
  company: string;
  query: string;
}) {
  return getRepo().addLead(input);
}

export async function getLeads() {
  return getRepo().getLeads();
}

export async function updateLead(
  id: string,
  patch: Partial<Pick<{ status: "new" | "contacted"; note?: string }, "status" | "note">>
) {
  return getRepo().updateLead(id, patch);
}

export async function getSearchLogs() {
  return getRepo().getSearchLogs();
}

export async function addSearchLog(q: string, ip: string): Promise<void> {
  return getRepo().addSearchLog(q, ip);
}

export async function getNews(): Promise<ContentItem[]> {
  return getRepo().getContents("news");
}

export async function getContents(type?: ContentType): Promise<ContentItem[]> {
  return getRepo().getContents(type);
}

export async function getContent(id: string): Promise<ContentItem | null> {
  return getRepo().getContent(id);
}

export async function saveContents(items: ContentItem[]): Promise<ContentItem[]> {
  return getRepo().saveContents(items);
}

/** 历史兼容：保存全部内容（含资讯/产品/案例） */
export async function saveNews(items: ContentItem[]): Promise<ContentItem[]> {
  return getRepo().saveContents(items);
}

export async function getAuditLogs() {
  return getRepo().getAuditLogs();
}

export async function appendAudit(input: {
  actor: string;
  action: string;
  target: string;
  ip: string;
  detail?: string;
}): Promise<void> {
  return getRepo().appendAudit(input);
}

export function newId(prefix: string): string {
  return getRepo().newId(prefix);
}
