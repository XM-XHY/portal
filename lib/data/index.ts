import { JsonRepo } from "./json-repo";
import { SupabaseRepo } from "./supabase-repo";
import type { Repo } from "./types";

let repo: Repo | null = null;

/**
 * 按环境变量选择存储实现：
 * - 配置了 SUPABASE_URL + 服务端密钥 → Supabase（生产/Serverless）
 * - 否则 → JSON 文件（本地开发/自托管，零依赖）
 *
 * 服务端密钥兼容多个常见命名，用户填任意一个即可：
 * SUPABASE_SERVICE_ROLE_KEY（推荐）> SUPABASE_KEY > SUPABASE_ANON_KEY（兜底，受 RLS 限制）
 */
export function getRepo(): Repo {
  if (repo) return repo;
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_ANON_KEY;
  if (url && key) {
    repo = new SupabaseRepo(url, key);
  } else {
    repo = new JsonRepo();
  }
  return repo;
}
