#!/usr/bin/env node
/**
 * 管理员口令轮换 / 重置脚本
 *
 * 为什么需要它：
 *   口令哈希是 sha256(ADMIN_PASSWORD_SALT + 明文)（见 lib/data/hash.ts）。
 *   一旦把生产环境的 ADMIN_PASSWORD_SALT 从旧的静态值换成新的随机强值，
 *   库里所有历史 pw_hash 会立即失效 —— 后台将无法登录。
 *   所以「换盐」必须与「按新盐重算口令哈希」成对执行，本脚本负责后者。
 *
 * 安全约定：
 *   - 口令只从环境变量读取，绝不写进 argv / 日志 / 输出；
 *   - 只打印用户名与成败，不打印口令、盐、哈希；
 *   - 默认 dry-run，需显式加 --apply 才真正写库。
 *
 * 用法（把值放进环境变量，不要写进命令行）：
 *   export CLOUDBASE_ENV_ID=xm-xhy-d6gct2tdec159c251
 *   export CLOUDBASE_PG_API_KEY=<线上库 API Key>
 *   export ADMIN_PASSWORD_SALT=<新的盐>
 *   export TARGET_USER=admin
 *   export NEW_ADMIN_PASSWORD=<新口令>
 *   node scripts/rotate-admin-password.mjs            # 预演，只读
 *   node scripts/rotate-admin-password.mjs --apply    # 实际写入
 *
 * 若目标账号不存在，加 --create 会按给定角色新建（配合 INITIAL_ADMIN_PASSWORD 场景）。
 */

import crypto from "node:crypto";

const APPLY = process.argv.includes("--apply");
const CREATE = process.argv.includes("--create");

const ENV_ID = process.env.CLOUDBASE_ENV_ID?.trim();
const REST_BASE =
  process.env.CLOUDBASE_PG_REST_BASE?.trim() ||
  (ENV_ID ? `https://${ENV_ID}.api.tcloudbasegateway.com/v1/rdb/rest` : "");
const API_KEY = process.env.CLOUDBASE_PG_API_KEY?.trim();
const SALT = process.env.ADMIN_PASSWORD_SALT?.trim();
const USER = process.env.TARGET_USER?.trim() || "admin";
const NEW_PW = process.env.NEW_ADMIN_PASSWORD;
const ROLE = process.env.TARGET_ROLE?.trim() || "super";

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

if (!REST_BASE) die("缺少 CLOUDBASE_PG_REST_BASE 或 CLOUDBASE_ENV_ID");
if (!API_KEY) die("缺少 CLOUDBASE_PG_API_KEY");
if (!SALT) die("缺少 ADMIN_PASSWORD_SALT（必须与生产环境注入的值完全一致）");
if (!NEW_PW) die("缺少 NEW_ADMIN_PASSWORD");
if (NEW_PW.length < 10) die("新口令至少 10 位（建议 14 位以上，含大小写/数字/符号）");

// 与 lib/data/hash.ts 保持完全一致的算法
const hash = (pw) => crypto.createHash("sha256").update(SALT + pw).digest("hex");

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function req(path, init = {}) {
  const res = await fetch(`${REST_BASE}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body };
}

async function main() {
  console.log(`环境：${ENV_ID || REST_BASE}`);
  console.log(`目标账号：${USER}　模式：${APPLY ? "写入" : "预演（只读）"}`);

  const found = await req(`/admins?username=eq.${encodeURIComponent(USER)}&select=id,username,role`);
  if (!found.ok) die(`查询失败 HTTP ${found.status}：${JSON.stringify(found.body)?.slice(0, 200)}`);

  const rows = Array.isArray(found.body) ? found.body : [];
  const newHash = hash(NEW_PW);

  if (!rows.length) {
    if (!CREATE) {
      die(`账号 ${USER} 不存在。确认用户名，或加 --create 新建。`);
    }
    const id = `a_${crypto.randomUUID().slice(0, 8)}`;
    if (!APPLY) {
      console.log(`· 预演：将新建账号 ${USER}（role=${ROLE}, id=${id}）`);
      return;
    }
    const ins = await req(`/admins`, {
      method: "POST",
      body: JSON.stringify({ id, username: USER, role: ROLE, pw_hash: newHash }),
    });
    if (!ins.ok) die(`新建失败 HTTP ${ins.status}：${JSON.stringify(ins.body)?.slice(0, 200)}`);
    console.log(`✓ 已新建账号 ${USER}（role=${ROLE}）`);
    return;
  }

  const target = rows[0];
  if (!APPLY) {
    console.log(`· 预演：将把 ${USER}（id=${target.id}, role=${target.role}）的 pw_hash 更新为新盐哈希`);
    console.log(`  提示：执行前请确认生产环境已注入同一个 ADMIN_PASSWORD_SALT。`);
    return;
  }

  const upd = await req(`/admins?id=eq.${encodeURIComponent(target.id)}`, {
    method: "PATCH",
    body: JSON.stringify({ pw_hash: newHash }),
  });
  if (!upd.ok) die(`更新失败 HTTP ${upd.status}：${JSON.stringify(upd.body)?.slice(0, 200)}`);
  console.log(`✓ 已重置 ${USER} 的口令哈希（role=${target.role}）`);
  console.log(`  下一步：用新口令登录后台验证，确认无误后再交付使用。`);
}

main().catch((e) => die(e?.message || String(e)));
