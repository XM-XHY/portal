// 后台 RBAC 权限模型（演示用，前端骨架）。
// 生产环境应通过服务端会话（Supabase / NextAuth）下发角色与权限，切勿在前端硬编码密钥或越权逻辑。

export type Role = "super" | "editor" | "lead" | "viewer";

export type Permission =
  | "content.manage" // 内容(CMS)增删改
  | "leads.view" // 线索查看
  | "leads.export" // 线索导出
  | "search.logs" // 搜索/获客日志查看
  | "users.manage" // 用户与角色管理
  | "settings.manage" // 系统设置/API 配置
  | "audit.view"; // 操作审计日志查看

export const ROLE_LABELS: Record<Role, string> = {
  super: "超级管理员",
  editor: "内容编辑",
  lead: "线索管理员",
  viewer: "只读访客",
};

export const PERMISSION_LABELS: Record<Permission, string> = {
  "content.manage": "内容管理",
  "leads.view": "线索查看",
  "leads.export": "线索导出",
  "search.logs": "获客日志",
  "users.manage": "用户与角色",
  "settings.manage": "系统设置",
  "audit.view": "操作审计",
};

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  super: [
    "content.manage",
    "leads.view",
    "leads.export",
    "search.logs",
    "users.manage",
    "settings.manage",
    "audit.view",
  ],
  editor: ["content.manage"],
  lead: ["leads.view", "leads.export", "search.logs"],
  viewer: ["search.logs", "audit.view"],
};

export function can(role: Role, perm: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(perm);
}
