/**
 * 从本地 data/db.json 批量恢复线上内容（保留原 id）。
 * 用途：误删 / 迁移后把站点内容写回 Supabase。
 *
 * 用法：
 *   node scripts/restore-contents.mjs <baseUrl> [文件路径]
 *   例：node scripts/restore-contents.mjs https://www.cnxhy.top
 *   需要先能登录后台：脚本用 ADMIN_USER / ADMIN_PASS 环境变量（默认 admin / #XHY-@350211）
 */
import fs from "node:fs";
import path from "node:path";

const base = process.argv[2] || "https://www.cnxhy.top";
const file = process.argv[3] || path.join(process.cwd(), "data", "db.json");
const user = process.env.ADMIN_USER || "admin";
const pass = process.env.ADMIN_PASS || "#XHY-@350211";

const db = JSON.parse(fs.readFileSync(file, "utf8"));
const items = Array.isArray(db) ? db : db.contents || [];
console.log(`读取 ${file} → ${items.length} 条`);

const login = await fetch(`${base}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: user, password: pass }),
});
if (!login.ok) throw new Error("登录失败 " + login.status);
const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

const r = await fetch(`${base}/api/contents`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify(items),
});
const d = await r.json().catch(() => ({}));
console.log("导入结果:", r.status, JSON.stringify(d));

const chk = await fetch(`${base}/api/contents`, { headers: { Cookie: cookie }, cache: "no-store" });
const all = await chk.json();
const by = {};
for (const o of all) by[o.type] = (by[o.type] || 0) + 1;
console.log("线上现有:", JSON.stringify(by));
