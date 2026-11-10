// 后台 RBAC 权限模型（演示用，前端骨架）。
// 生产环境应通过服务端会话（Supabase / NextAuth）下发角色与权限，切勿在前端硬编码密钥或越权逻辑。

export type Role = "super" | "editor" | "lead" | "viewer" | "employee" | "teacher";

export type Permission =
  | "content.manage" // 内容(CMS)增删改
  | "leads.view" // 线索查看
  | "leads.export" // 线索导出
  | "search.logs" // 搜索/获客日志查看
  | "users.manage" // 用户与角色管理
  | "settings.manage" // 系统设置/API 配置
  | "audit.view" // 操作审计日志查看
  | "schedule.manage" // 排课系统管理
  | "order.manage" // 订单查看 / 查单 / 退款 / 导出
  | "balance.manage"; // 均衡分班：发布家长查询码 / 管理自己发布的查询码

export const ROLE_LABELS: Record<Role, string> = {
  super: "超级管理员",
  editor: "内容编辑",
  lead: "线索管理员",
  viewer: "只读访客",
  employee: "员工",
  teacher: "教师",
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
  "order.manage": "订单管理",
  "balance.manage": "分班查询码管理",
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
    "order.manage",
    "balance.manage",
  ],
  editor: ["content.manage", "schedule.manage", "balance.manage"],
  lead: ["leads.view", "leads.export", "search.logs"],
  viewer: ["search.logs", "audit.view"],
  // 员工/老师：可登录 /hub 使用知识中枢，也可在 /balance 发布与管理分班查询码；
  // 不授予任何后台 CMS 权限（后台 Tab 均按具体权限过滤）。
  employee: ["balance.manage"],
  // 教师：自助注册账号，仅用于「老师端分班查询码管理」（/balance 发布与查询码管理）。
  // 不进入后台 CMS；如需让其也能管理排课系统，可在后台逐账号勾选 schedule.manage。
  teacher: ["balance.manage"],
};

/** 员工账号（可登录企业知识中枢，无后台权限） */
export function isEmployeeRole(role: Role): boolean {
  return role === "employee";
}

/**
 * 权限判定。
 * - can(role, perm)：按角色默认权限判断（保留原签名，向后兼容）。
 * - can({ role, perms }, perm)：支持逐账号权限覆盖。当 subject.perms 为数组时，
 *   以其为准（覆盖角色默认）；为 undefined/null 时回退到角色默认。
 * 这样后台「逐账号勾选分配」才能真正生效：把覆盖后的 perms 传给会话/接口即可。
 */
export function can(role: Role, perm: Permission): boolean;
export function can(
  subject: { role: Role; perms?: string[] | null },
  perm: Permission
): boolean;
export function can(
  subject: Role | { role: Role; perms?: string[] | null },
  perm: Permission
): boolean {
  if (typeof subject === "string") {
    return ROLE_PERMISSIONS[subject].includes(perm);
  }
  const { role, perms } = subject;
  if (Array.isArray(perms)) return perms.includes(perm);
  return ROLE_PERMISSIONS[role].includes(perm);
}
