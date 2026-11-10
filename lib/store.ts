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

/** 修改账号角色（超管在后台「用户与角色」调整权限） */
export async function setAdminRole(id: string, role: import("./data/types").Role): Promise<boolean> {
  return getRepo().setAdminRole(id, role);
}

/** 设置账号的逐用户权限覆盖（传 null 清除覆盖，回退角色默认） */
export async function setAdminPerms(id: string, perms: string[] | null): Promise<boolean> {
  return getRepo().setAdminPerms(id, perms);
}

/** 新增账号（管理员 / 员工 / 教师），用户名重复时抛错 */
export async function addAdmin(input: {
  username: string;
  password: string;
  role: import("./data/types").Role;
  perms?: string[];
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

/** 保存（upsert）若干条目：安全，不会删除其他数据 */
export async function saveContents(items: ContentItem[]): Promise<ContentItem[]> {
  return getRepo().saveContents(items);
}

/**
 * 整体替换内容表：写入传入条目并删除其余条目。
 * ⚠️ 危险操作，仅限后台「删除条目」等明确需要全量覆盖的场景使用。
 */
export async function replaceContents(items: ContentItem[]): Promise<ContentItem[]> {
  return getRepo().replaceContents(items);
}

/** 按 id 精确删除内容条目 */
export async function deleteContents(ids: string[]): Promise<void> {
  return getRepo().deleteContents(ids);
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
