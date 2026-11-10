/**
 * 把海外 Supabase 的 6 张业务表迁到国产 CloudBase PostgreSQL。
 *
 * 用法：
 *   node scripts/migrate-to-cloudbase-pg.mjs --dry-run   # 只统计两边行数，不写任何数据
 *   node scripts/migrate-to-cloudbase-pg.mjs              # 执行迁移并逐表校验
 *   node scripts/migrate-to-cloudbase-pg.mjs --force      # 目标表非空时也继续（一般不要用）
 *
 * 凭据全部从 .env.local 读取，不通过命令行参数传递（避免密钥进入 shell 历史 / 日志）：
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY   —— 源（旧库）
 *   CLOUDBASE_PG_API_KEY                      —— 目标（国产库，service_role）
 *   CLOUDBASE_ENV_ID / CLOUDBASE_PG_REST_BASE —— 可选，覆盖网关地址
 *
 * 源库全程只读，**迁移不会改动或删除旧库任何数据**，随时可回滚。
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");
const DEFAULT_ENV_ID = "xm-xhy-d6gct2tdec159c251";

function loadEnv(file = ".env.local") {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) throw new Error(`找不到 ${file}`);
  const out = {};
  const quote = String.fromCharCode(34);
  const squote = String.fromCharCode(39);
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (v.length > 1 && (v[0] === quote || v[0] === squote) && v[v.length - 1] === v[0]) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const env = { ...process.env, ...loadEnv() };
const SRC = (env.SUPABASE_URL || "").replace(/\/+$/, "");
const SRC_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY || env.SUPABASE_ANON_KEY;
const PG_KEY = env.CLOUDBASE_PG_API_KEY;
const REST_BASE =
  (env.CLOUDBASE_PG_REST_BASE || `https://${env.CLOUDBASE_ENV_ID || DEFAULT_ENV_ID}.api.tcloudbasegateway.com/v1/rdb/rest`).replace(/\/+$/, "");

if (!SRC || !SRC_KEY) throw new Error("缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
if (!DRY_RUN && !PG_KEY) throw new Error("缺少 CLOUDBASE_PG_API_KEY（国产库 API Key）");

const TABLES = ["site_info", "admins", "leads", "contents", "search_logs", "audit_logs"];
// 这两张表主键是 GENERATED ALWAYS AS IDENTITY，不能带 id 写入；重新生成自增 id 不影响业务
const IDENTITY_TABLES = new Set(["search_logs", "audit_logs"]);
const CHUNK = 100;

const srcHeaders = { apikey: SRC_KEY, Authorization: `Bearer ${SRC_KEY}` };
const pgHeaders = PG_KEY ? { Authorization: `Bearer ${PG_KEY}` } : {};

async function readAll(table) {
  const r = await fetch(`${SRC}/rest/v1/${table}?select=*`, {
    headers: srcHeaders,
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`读旧库 ${table} 失败: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function pgCount(table) {
  const r = await fetch(`${REST_BASE}/${table}?select=*`, {
    method: "HEAD",
    headers: { ...pgHeaders, Prefer: "count=exact" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`读国产库 ${table} 失败: ${r.status} ${(await r.text()).slice(0, 200)}`);
  const cr = r.headers.get("content-range") || "";
  const n = Number(cr.split("/")[1] ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function pgUpsert(table, rows) {
  const hasId = !IDENTITY_TABLES.has(table);
  const payload = hasId ? rows : rows.map(({ id, ...rest }) => rest);
  const qs = hasId ? "?on_conflict=id" : "";
  const prefer = hasId ? "resolution=merge-duplicates, return=minimal" : "return=minimal";
  const r = await fetch(`${REST_BASE}/${table}${qs}`, {
    method: "POST",
    headers: {
      ...pgHeaders,
      "Content-Type": "application/json",
      Prefer: prefer,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!r.ok) {
    throw new Error(`写国产库 ${table} 失败: ${r.status} ${(await r.text()).slice(0, 300)}`);
  }
}

async function main() {
  console.log(`模式: ${DRY_RUN ? "DRY-RUN（只读）" : "执行迁移"}`);
  console.log(`源库: ${new URL(SRC).host}`);
  console.log(`目标: ${REST_BASE}`);
  console.log("");
  console.log("表名".padEnd(15), "旧库".padStart(8), "国产库(迁移前)".padStart(16), "结果");

  let failed = false;
  for (const table of TABLES) {
    const rows = await readAll(table);
    const before = DRY_RUN && !PG_KEY ? "-" : await pgCount(table);

    if (DRY_RUN) {
      console.log(table.padEnd(15), String(rows.length).padStart(8), String(before).padStart(16), "跳过（dry-run）");
      continue;
    }

    const isIdentity = IDENTITY_TABLES.has(table);
    if (before > 0 && !FORCE) {
      console.log(table.padEnd(15), String(rows.length).padStart(8), String(before).padStart(16), "目标非空，跳过（如需覆盖加 --force）");
      continue;
    }

    try {
      for (let i = 0; i < rows.length; i += CHUNK) {
        await pgUpsert(table, rows.slice(i, i + CHUNK));
      }
      const after = await pgCount(table);
      const expected = isIdentity && before > 0 ? before + rows.length : Math.max(before, rows.length);
      const ok = after >= expected;
      if (!ok) failed = true;
      console.log(table.padEnd(15), String(rows.length).padStart(8), String(before).padStart(16), `${ok ? "✓" : "✗"} 迁移后 ${after} 行`);
    } catch (e) {
      failed = true;
      console.log(table.padEnd(15), String(rows.length).padStart(8), String(before).padStart(16), `✗ ${e.message}`);
    }
  }

  console.log("");
  if (DRY_RUN) {
    console.log("dry-run 完成，未写入任何数据。确认无误后去掉 --dry-run 再跑一次。");
  } else if (failed) {
    console.error("部分表迁移失败，请检查上方错误。旧库数据未被修改，可安全重试。");
    process.exitCode = 1;
  } else {
    console.log("迁移完成。旧库保持只读未改动；如需回滚，删掉 CLOUDBASE_PG_API_KEY 即回到旧库。");
  }
}

main().catch((e) => {
  console.error("迁移中止:", e.message);
  process.exitCode = 1;
});
