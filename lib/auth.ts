// 后台 RBAC 权限模型（演示用，前端骨架）。
// 生产环境应通过服务端会话（Supabase / NextAuth）下发角色与权限，切勿在前端硬编码密钥或越权逻辑。

export type Role = "super" | "editor" | "lead" | "viewer" | "employee";

export type Permission =
  | "content.manage" // 内容(CMS)增删改
  | "leads.view" // 线索查看
  | "leads.export" // 线索导出
  | "search.logs" // 搜索/获客日志查看
  | "users.manage" // 用户与角色管理
  | "settings.manage" // 系统设置/API 配置
  | "audit.view" // 操作审计日志查看
  | "schedule.manage"; // 排课系统管理

export const ROLE_LABELS: Record<Role, string> = {
  super: "超级管理员",
  editor: "内容编辑",
  lead: "线索管理员",
  viewer: "只读访客",
  employee: "员工",
};

export const PERMISSION_LABELS: Record<Permission, string> = {
  "content.manage": "内容管理",
  "leads.view": "线索查看",
  "leads.export": "线索导出",
  "search.logs": "获客日志",
  "users.manage": "用户与角色",
  "settings.manage": "系统设置",
  "audit.view": "操作审计",
  "schedule.manage": "排课管理",
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
    "schedule.manage",
  ],
  editor: ["content.manage", "schedule.manage"],
  lead: ["leads.view", "leads.export", "search.logs"],
  viewer: ["search.logs", "audit.view"],
  // 员工：无后台管理权限，仅可登录 /hub 使用企业知识中枢
  employee: [],
};

/** 员工账号（可登录企业知识中枢，无后台权限） */
export function isEmployeeRole(role: Role): boolean {
  return role === "employee";
}

export function can(role: Role, perm: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(perm);
}
