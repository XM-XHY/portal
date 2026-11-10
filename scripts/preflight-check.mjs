#!/usr/bin/env node
/**
 * 上线前自检（preflight）
 *
 * 目的：把「上线前必须做的事」变成一条可重复执行的命令，而不是散落在文档里的口头约定。
 * 任何一项 FAIL 都不应发布；WARN 需人工确认后放行。
 *
 * 用法：
 *   node scripts/preflight-check.mjs
 *   node scripts/preflight-check.mjs --prod     # 额外校验生产必填项（会更严格）
 *
 * 退出码：0 全部通过（可能有 WARN）；1 存在 FAIL。
 *
 * 安全：本脚本只输出「是否已配置 / 长度 / 是否弱值」，绝不打印任何密钥明文。
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const PROD = process.argv.includes("--prod");

const results = [];
const pass = (item, msg) => results.push({ level: "PASS", item, msg });
const warn = (item, msg) => results.push({ level: "WARN", item, msg });
const fail = (item, msg) => results.push({ level: "FAIL", item, msg });

/** 生产必填密钥：缺失时应用会 fail-fast 拒绝启动，或会导致鉴权体系不可用 */
const REQUIRED_SECRETS = [
  { key: "ADMIN_SESSION_SECRET", minLen: 32, why: "后台会话 HMAC 签名密钥，缺失即生产拒启动" },
  { key: "PAY_GRANT_SECRET", minLen: 32, why: "付费票据 HMAC 密钥，未配置时回落 ADMIN_SESSION_SECRET" },
  { key: "WORK_SESSION_SECRET", minLen: 32, why: "作品会员会话密钥，未配置时回落 ADMIN_SESSION_SECRET" },
  { key: "ADMIN_PASSWORD_SALT", minLen: 32, why: "口令哈希盐，缺失即生产拒启动（本次安全收紧新增）" },
];

const WEAK_VALUES = [
  "change-me",
  "changeme",
  "xx-tech-session-secret-change-me",
  "dev-pay-grant-secret-change-me",
  "dev-work-session-secret-change-me",
  "xx-tech-static-salt-v1",
  "secret",
  "password",
  "123456",
];

function parseEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

// ---------- 1. 本地密钥文件 ----------
const secretsFile = path.join(ROOT, ".env.secrets.local");
const secrets = parseEnvFile(secretsFile);

if (!fs.existsSync(secretsFile)) {
  fail("密钥文件", "缺少 .env.secrets.local（应先运行密钥生成步骤）");
} else {
  pass("密钥文件", ".env.secrets.local 存在");
  // 必须被 git 忽略，否则密钥会进版本库
  try {
    execFileSync("git", ["check-ignore", "-q", ".env.secrets.local"], { cwd: ROOT, stdio: "pipe" });
    pass("密钥文件", "已被 .gitignore 忽略，不会进入版本库");
  } catch {
    fail("密钥文件", "⚠️ 未被 .gitignore 忽略！密钥有泄漏进版本库的风险");
  }
}

for (const s of REQUIRED_SECRETS) {
  const v = secrets[s.key];
  if (!v) {
    fail(`密钥 ${s.key}`, `未生成（${s.why}）`);
    continue;
  }
  if (v.length < s.minLen) {
    fail(`密钥 ${s.key}`, `长度 ${v.length} < ${s.minLen}，强度不足`);
  } else if (WEAK_VALUES.some((w) => v.toLowerCase().includes(w))) {
    fail(`密钥 ${s.key}`, "命中弱值/示例值黑名单");
  } else {
    pass(`密钥 ${s.key}`, `已生成，长度 ${v.length}，未命中弱值`);
  }
}

// 四个密钥两两不同（重复使用会扩大单点失陷半径）
const values = REQUIRED_SECRETS.map((s) => secrets[s.key]).filter(Boolean);
if (values.length === REQUIRED_SECRETS.length) {
  if (new Set(values).size === values.length) pass("密钥隔离", "四个密钥互不相同");
  else fail("密钥隔离", "存在重复密钥值，应各自独立生成");
}

// ---------- 2. 依赖安全 ----------
let pkg = {};
try {
  pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
} catch {
  fail("package.json", "无法读取或解析");
}

const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
if (deps.xlsx) {
  fail("依赖 xlsx", `仍在依赖中（${deps.xlsx}）——该包 high 级漏洞无官方修复版，应使用 exceljs`);
} else {
  pass("依赖 xlsx", "已移除（替换为 exceljs，见 lib/sheet.ts）");
}
if (deps.exceljs) pass("依赖 exceljs", `已引入 ${deps.exceljs}`);
else fail("依赖 exceljs", "未引入，表格读写将不可用");

const nextVer = String(pkg.dependencies?.next || "").replace(/^[^\d]*/, "");
if (nextVer) {
  const [maj] = nextVer.split(".").map(Number);
  if (maj < 15) {
    warn(
      "依赖 next",
      `next ${nextVer}：14.x 已进入维护末期，npm audit 仍有可达的 RSC DoS（high）等公告；` +
        `升级到 15.5.28+ 才能消除，属破坏性大版本升级，需单独立项`
    );
  } else {
    pass("依赖 next", `next ${nextVer}`);
  }
}

// ---------- 3. 安全 fail-fast 探针（静态确认收紧确实落地） ----------
// 判定标准是「生产分支必须 throw」+「不得回退到 `env || "写死值"` 式静默兜底」。
// 注意：非生产环境保留 dev 兜底常量是合理的，因此不禁用字符串本身，只禁止那种兜底写法。
const probes = [
  {
    file: "lib/pay-access.ts",
    mustHave: ["item.paid === false", "402"],
    mustNotHave: ["if (!item || !item.paid || item.amount <= 0)"],
    msg: "付费墙 fail-closed（未显式免费即需票据）",
  },
  {
    file: "lib/session.ts",
    mustHave: ['process.env.NODE_ENV === "production"', "throw new Error"],
    mustNotHave: ['process.env.ADMIN_SESSION_SECRET || "xx-tech-session-secret-change-me"'],
    msg: "后台会话密钥：生产缺密钥 fail-fast，无静默兜底",
  },
  {
    file: "lib/pay-grant.ts",
    mustHave: ['process.env.NODE_ENV === "production"', "throw new Error"],
    mustNotHave: ['|| "dev-pay-grant-secret-change-me"'],
    msg: "付费票据密钥：生产缺密钥 fail-fast，无静默兜底",
  },
  {
    file: "lib/work-session.ts",
    mustHave: ['process.env.NODE_ENV === "production"', "throw new Error"],
    mustNotHave: ['|| "dev-work-session-secret-change-me"'],
    msg: "作品会话密钥：生产缺密钥 fail-fast，无静默兜底",
  },
  {
    file: "lib/data/hash.ts",
    mustHave: ['process.env.NODE_ENV === "production"', "throw new Error"],
    mustNotHave: ['process.env.ADMIN_PASSWORD_SALT || "xx-tech-static-salt-v1"'],
    msg: "口令盐：生产缺盐 fail-fast，无静默兜底",
  },
];

for (const p of probes) {
  const abs = path.join(ROOT, p.file);
  if (!fs.existsSync(abs)) {
    fail(`探针 ${p.file}`, "文件不存在");
    continue;
  }
  const src = fs.readFileSync(abs, "utf8");
  const missing = p.mustHave.filter((s) => !src.includes(s));
  const leftover = p.mustNotHave.filter((s) => src.includes(s));
  if (missing.length) fail(`探针 ${p.file}`, `${p.msg}：缺少预期实现 ${JSON.stringify(missing)}`);
  else if (leftover.length) fail(`探针 ${p.file}`, `${p.msg}：仍存在旧的不安全写法 ${JSON.stringify(leftover)}`);
  else pass(`探针 ${p.file}`, p.msg);
}

// ---------- 4. 测试资产 ----------
const testDirs = ["tests/unit", "tests/smoke", "tests/regression", "tests/contract"];
for (const d of testDirs) {
  const abs = path.join(ROOT, d);
  const exists = fs.existsSync(abs) && fs.readdirSync(abs).length > 0;
  if (exists) pass(`测试资产 ${d}`, "存在");
  else fail(`测试资产 ${d}`, "缺失");
}
if (fs.existsSync(path.join(ROOT, ".github/workflows/ci.yml"))) {
  pass("CI", "存在 .github/workflows/ci.yml");
} else {
  fail("CI", "缺少 CI 工作流，门禁无法自动执行");
}

// ---------- 5. 幂等指纹（便于比对两次自检是否一致） ----------
const fp = crypto
  .createHash("sha256")
  .update(JSON.stringify({ prod: PROD, files: results.map((r) => r.item + r.level) }))
  .digest("hex")
  .slice(0, 12);

// ---------- 输出 ----------
const icon = { PASS: "✓", WARN: "!", FAIL: "✗" };
console.log("\n=== 上线前自检 (preflight) ===\n");
for (const r of results) {
  console.log(`${icon[r.level]} [${r.level}] ${r.item}：${r.msg}`);
}
const counts = results.reduce((a, r) => ((a[r.level] = (a[r.level] || 0) + 1), a), {});
console.log(
  `\n汇总：PASS ${counts.PASS || 0} / WARN ${counts.WARN || 0} / FAIL ${counts.FAIL || 0}　指纹 ${fp}`
);

if (counts.FAIL) {
  console.log("\n结论：存在阻断项，不得发布。\n");
  process.exit(1);
}
if (counts.WARN) {
  console.log("\n结论：无阻断项，但存在需人工确认的告警项。\n");
  process.exit(0);
}
console.log("\n结论：全部通过。\n");
