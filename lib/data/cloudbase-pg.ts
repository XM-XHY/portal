/**
 * CloudBase PostgreSQL（国产库）接入适配层。
 *
 * 背景：`lib/data/supabase-repo.ts` 用 `@supabase/supabase-js` 发标准 PostgREST 请求，
 * 全站 48 个 API 路由都通过 `@/lib/store` → Repo 访问数据。国产化最省事、回归面最小的
 * 做法不是重写仓储层，而是在 `createClient` 的 global.fetch 上做一次 URL 重写：
 *
 *   supabase-js 生成   https://<host>/rest/v1/<table>?<query>
 *   CloudBase PG 网关   https://<envId>.api.tcloudbasegateway.com/v1/rdb/rest/<table>?<query>
 *
 * 两者都是 PostgREST：`eq/in/order/offset/limit/on_conflict` 查询参数、
 * `Prefer: resolution=merge-duplicates`（upsert）、
 * `Accept: application/vnd.pgrst.object+json`（single/maybeSingle）全部一致。
 * 已用 spy fetch 验证过 supabase-js 2.118 的实际请求形态。
 *
 * 鉴权：CloudBase 的 **API Key** 映射到 `service_role`，绕过 RLS，等价于 Supabase 的
 * service_role key。它只在服务端环境变量里，绝不进入浏览器代码。
 */
export function cloudbasePgRestBase(envId: string): string {
  return `https://${envId}.api.tcloudbasegateway.com/v1/rdb/rest`;
}

type FetchLike = (input: any, init?: any) => Promise<Response>;

/** CloudBase PG 只暴露 public schema，profile 头是 Supabase 特有，去掉避免网关误判 */
const PROFILE_HEADERS = ["accept-profile", "content-profile"];

/**
 * 生成一个可直接塞进 `createClient(url, key, { global: { fetch } })` 的 fetch。
 * 非数据面请求（理论上不会出现）原样放行，避免误伤。
 */
export function createCloudBasePgFetch(restBase: string, apiKey: string): FetchLike {
  const base = restBase.replace(/\/+$/, "");

  return async (input: any, init?: any): Promise<Response> => {
    const req: Request = input instanceof Request ? input : new Request(String(input), init);
    const u = new URL(req.url);

    const match = u.pathname.match(/^\/rest\/v1\/(.+)$/);
    if (!match) {
      return fetch(req, { cache: "no-store" } as RequestInit);
    }

    const headers = new Headers(req.headers);
    headers.set("authorization", `Bearer ${apiKey}`);
    headers.delete("apikey"); // CloudBase 网关不认 Supabase 的 apikey 头
    for (const h of PROFILE_HEADERS) headers.delete(h);

    // CloudBase 网关写操作默认 return=minimal（无响应体）。
    // supabase-js 的部分调用会解析返回值，统一要求返回表示，行为与 Supabase 对齐。
    if (req.method !== "GET" && req.method !== "HEAD") {
      const prefer = headers.get("prefer") ?? "";
      if (!/\breturn=/.test(prefer)) {
        headers.set(
          "prefer",
          prefer ? `${prefer}, return=representation` : "return=representation"
        );
      }
    }

    const body =
      req.method === "GET" || req.method === "HEAD"
        ? undefined
        : await req.clone().arrayBuffer();

    // Next.js 14 服务端 fetch 默认 force-cache，必须显式 no-store，
    // 否则后台改完数据前台仍读到旧值（历史上踩过这个坑）。
    return fetch(`${base}/${match[1]}${u.search}`, {
      method: req.method,
      headers,
      body,
      cache: "no-store",
    });
  };
}
