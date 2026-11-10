import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { JsonRepo } from "./json-repo";
import { SupabaseRepo } from "./supabase-repo";
import { cloudbasePgRestBase, createCloudBasePgFetch } from "./cloudbase-pg";
import type { Repo } from "./types";

let repo: Repo | null = null;

const DEFAULT_CLOUDBASE_ENV_ID = "xm-xhy-d6gct2tdec159c251";

/**
 * 按环境变量选择存储实现，优先级从高到低：
 *
 * 1. `CLOUDBASE_PG_API_KEY` 存在 → **国产 CloudBase PostgreSQL**（当前生产目标）。
 *    复用 SupabaseRepo 的全部查询逻辑，只把底层 fetch 重写到国产 PostgREST 网关。
 *    `CLOUDBASE_ENV_ID` 可覆盖环境 ID，`CLOUDBASE_PG_REST_BASE` 可覆盖完整网关地址。
 * 2. `SUPABASE_URL` + 服务端密钥 → 海外 Supabase（**仅作回滚兜底**）。
 *    服务端密钥兼容多个常见命名：
 *    SUPABASE_SERVICE_ROLE_KEY（推荐）> SUPABASE_KEY > SUPABASE_ANON_KEY（受 RLS 限制）
 * 3. 都没有 → JSON 文件（本地开发/自托管，零依赖）
 *
 * ⚠️ 国产库连不上时**不自动回落到 Supabase**：静默写回海外库会让"国产化"名存实亡，
 * 宁可让错误暴露出来。要回滚就显式删掉 `CLOUDBASE_PG_API_KEY`。
 */
export function getRepo(): Repo {
  if (repo) return repo;

  const pgKey = process.env.CLOUDBASE_PG_API_KEY;
  if (pgKey) {
    const envId = process.env.CLOUDBASE_ENV_ID || DEFAULT_CLOUDBASE_ENV_ID;
    const restBase =
      process.env.CLOUDBASE_PG_REST_BASE || cloudbasePgRestBase(envId);
    // supabase-js 需要一个合法 base URL 才能拼出 /rest/v1/<table>；
    // 实际请求会被适配器重写，永远不会发到这个占位域名。
    repo = new SupabaseRepo(
      "https://cloudbase.invalid",
      pgKey,
      createCloudBasePgFetch(restBase, pgKey)
    );
    return repo;
  }

  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_ANON_KEY;
  repo = url && key ? new SupabaseRepo(url, key) : new JsonRepo();
  return repo;
}

let workClient: SupabaseClient | null = null;

/**
 * 给「作品并入」等业务表（work_users / work_entitlements / work_mistakes /
 * work_flywheel）用的原生 PostgREST 客户端。这些表不在 Repo 接口的 6 张核心表内，
 * 也不适合塞进 contents，所以单独开一个客户端；连接目标与 getRepo() 完全一致
 * （国产 PG 优先，删掉 Key 才回落 Supabase），保证不会出现「主站读国产库、
 * 作品写海外库」的数据分叉。
 *
 * 返回 null 表示当前是 JsonRepo 本地模式（没有数据库），调用方需显式降级。
 */
export function getWorkClient(): SupabaseClient | null {
  if (workClient) return workClient;

  const pgKey = process.env.CLOUDBASE_PG_API_KEY;
  if (pgKey) {
    const envId = process.env.CLOUDBASE_ENV_ID || DEFAULT_CLOUDBASE_ENV_ID;
    const restBase = process.env.CLOUDBASE_PG_REST_BASE || cloudbasePgRestBase(envId);
    workClient = createClient("https://cloudbase.invalid", pgKey, {
      auth: { persistSession: false },
      global: { fetch: createCloudBasePgFetch(restBase, pgKey) },
    });
    return workClient;
  }

  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  workClient = createClient(url, key, {
    auth: { persistSession: false },
    // Next.js 14 默认 force-cache，读请求必须显式绕开 Data Cache
    global: { fetch: (input: any, init: any) => fetch(input, { ...init, cache: "no-store" }) },
  });
  return workClient;
}
