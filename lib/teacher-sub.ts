/**
 * 教师工作台订阅系统 — 服务端专用代理模块。
 *
 * 订阅数据存放在腾讯云 CloudBase 云函数 `ent`（envId xm-xhy-d6gct2tdec159c251），
 * 其管理 API 通过 HTTP 访问服务暴露。本模块仅在服务端调用：
 *   - 共享密钥 TWB_ENT_ADMIN_SECRET 通过 X-Ent-Admin 头传递，绝不落到浏览器；
 *   - 云函数网关地址 TWB_ENT_API_BASE 同样只对服务端可见；
 *   - 所有请求 cache: 'no-store' + 8 秒超时（复用 lib/http.ts 的 fetchWithTimeout）。
 *
 * ⚠️ 客户端组件只应以 `import type` 引用本文件的类型，禁止在浏览器运行时导入本模块。
 *    页面一律通过本站 /api/admin/teacher-sub 间接访问，避免密钥与网关地址外泄。
 */

import { fetchWithTimeout, TimeoutError } from "@/lib/http";

/** 管理接口统一超时（毫秒） */
const TIMEOUT_MS = 8_000;

/** 六种账号状态（与云函数 ent 契约一致） */
export type SubStatus =
  | "trial" // 试用中
  | "pending" // 待支付
  | "paid" // 已付费
  | "auto_renew" // 已开通自动续费
  | "expired" // 已到期
  | "disabled"; // 权限停用

/** 网站账号关联信息 */
export type SiteLink = {
  status: string;
  siteUserId?: string | null;
};

/** 订阅用户（云函数 GET /api/admin/users 返回的单条记录） */
export type Subscriber = {
  account: string;
  registeredAt?: string | null;
  trialUntil?: string | null;
  paidUntil?: string | null;
  grantedUntil?: string | null;
  validUntil?: string | null;
  status: SubStatus;
  statusText?: string;
  payState?: string;
  renewState?: string;
  permission?: string;
  autoRenew?: boolean;
  siteLink?: SiteLink | null;
  lastOrderAt?: string | null;
};

/** 管理操作日志（云函数 GET /api/admin/logs 返回的单条记录） */
export type AdminLog = {
  at: string;
  actor: string;
  action: string;
  target: string;
  detail?: string;
  ip?: string;
};

/** 读取并校验服务端配置；密钥/网关缺失时明确抛错，绝不静默降级。 */
function envConfig(): { base: string; secret: string } {
  const base = (process.env.TWB_ENT_API_BASE || "").trim().replace(/\/+$/, "");
  const secret = (process.env.TWB_ENT_ADMIN_SECRET || "").trim();
  if (!base) {
    throw new Error(
      "[teacher-sub] 未配置 TWB_ENT_API_BASE（云函数 ent 网关根地址），无法访问教师工作台订阅服务"
    );
  }
  if (!secret) {
    throw new Error(
      "[teacher-sub] 未配置 TWB_ENT_ADMIN_SECRET（管理共享密钥），拒绝以空密钥发起管理请求"
    );
  }
  return { base, secret };
}

type AdminRequestOptions = {
  method?: "GET" | "POST";
  query?: Record<string, string | number | undefined>;
  body?: Record<string, unknown>;
};

/** 统一发起管理请求：带密钥头、no-store、超时、中文错误。 */
async function adminRequest<T>(path: string, opts: AdminRequestOptions = {}): Promise<T> {
  const { base, secret } = envConfig();

  let url: URL;
  try {
    url = new URL(base + path);
  } catch {
    throw new Error(
      "[teacher-sub] TWB_ENT_API_BASE 不是合法 URL，请检查云函数网关根地址配置"
    );
  }
  for (const [k, v] of Object.entries(opts.query || {})) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }

  const method = opts.method || "GET";
  const hasBody = opts.body !== undefined;
  const init: RequestInit = {
    method,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "X-Ent-Admin": secret,
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
    },
    ...(hasBody ? { body: JSON.stringify(opts.body) } : {}),
  };

  let res: Response;
  try {
    res = await fetchWithTimeout(url.toString(), init, TIMEOUT_MS);
  } catch (e) {
    if (e instanceof TimeoutError) {
      throw new Error(
        "[teacher-sub] 调用订阅服务超时（8 秒），请稍后重试或检查云函数 ent 运行状态"
      );
    }
    const msg = e instanceof Error ? e.message : "网络错误";
    throw new Error(`[teacher-sub] 无法连接订阅服务：${msg}`);
  }

  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new Error(`[teacher-sub] 订阅服务返回非 JSON 内容（HTTP ${res.status}）`);
  }

  if (!res.ok) {
    const msg = data?.error || data?.message || `HTTP ${res.status}`;
    throw new Error(`[teacher-sub] 订阅服务返回错误：${msg}`);
  }
  if (!data || data.ok !== true) {
    const msg = data?.error || data?.message || "响应缺少 ok:true";
    throw new Error(`[teacher-sub] 订阅服务返回失败：${msg}`);
  }
  return data as T;
}

/** 订阅用户列表。kw 为可选账号关键字，固定 limit=200（与云函数契约一致）。 */
export async function listSubscribers(kw?: string): Promise<Subscriber[]> {
  const data = await adminRequest<{ ok: true; users: Subscriber[] }>("/api/admin/users", {
    query: { kw: kw?.trim() || undefined, limit: 200 },
  });
  return Array.isArray(data.users) ? data.users : [];
}

/** 手动开通 / 延长使用期限。days 与 until 二选一或同时提供，由云函数解释优先级。 */
export async function grantSubscription(
  account: string,
  opts: { days?: number; until?: string; note?: string } = {}
): Promise<Subscriber> {
  const body: Record<string, unknown> = { account };
  if (opts.days !== undefined) body.days = opts.days;
  if (opts.until !== undefined) body.until = opts.until;
  if (opts.note !== undefined) body.note = opts.note;

  const data = await adminRequest<{ ok: true; user: Subscriber }>("/api/admin/grant", {
    method: "POST",
    body,
  });
  return data.user;
}

/** 停用指定账号权限。 */
export async function disableSubscription(account: string, note?: string): Promise<Subscriber> {
  const body: Record<string, unknown> = { account };
  if (note !== undefined) body.note = note;

  const data = await adminRequest<{ ok: true; user: Subscriber }>("/api/admin/disable", {
    method: "POST",
    body,
  });
  return data.user;
}

/** 最近管理操作日志。 */
export async function listAdminLogs(limit = 100): Promise<AdminLog[]> {
  const data = await adminRequest<{ ok: true; logs: AdminLog[] }>("/api/admin/logs", {
    query: { limit },
  });
  return Array.isArray(data.logs) ? data.logs : [];
}
