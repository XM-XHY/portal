/**
 * 通用：写入/更新 Vercel 项目环境变量（encrypted），可选触发重新部署。
 *
 * 用法：
 *   VERCEL_TOKEN=... node scripts/set-vercel-env.mjs KEY=VALUE [KEY2=VALUE2 ...] [--deploy]
 *
 * 说明：
 *   - 同名变量已存在时先删除再新建（Vercel env 不支持直接改值）
 *   - 一律以 type=encrypted 存储，控制台不可明文查看
 */
const TOKEN = process.argv
  .find((a) => a.startsWith("--token="))
  ?.slice(8) || process.env.VERCEL_TOKEN || "";
const PROJECT_ID = process.env.VERCEL_PROJECT_ID || "prj_LQQvY8YKmkX9ufaVMIlXXc5rJ3za";
const TEAM_ID = process.env.VERCEL_ORG_ID || "team_jDWNPvAhjbZQ5hEbFHbmSny1";

const pairs = process.argv
  .slice(2)
  .filter((a) => a.includes("=") && !a.startsWith("--"))
  .map((a) => {
    const i = a.indexOf("=");
    return [a.slice(0, i), a.slice(i + 1)];
  });
const doDeploy = process.argv.includes("--deploy");

if (!TOKEN) {
  console.error("缺少 VERCEL_TOKEN");
  process.exit(1);
}
if (!pairs.length) {
  console.error("用法: node scripts/set-vercel-env.mjs KEY=VALUE [--deploy]");
  process.exit(1);
}

const headers = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const api = (path, init = {}) =>
  fetch(`https://api.vercel.com${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });

async function upsertEnv(key, value) {
  // 查是否已存在
  const list = await (await api(`/v9/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`)).json();
  const existing = (list.envs || []).filter((e) => e.key === key);
  for (const e of existing) {
    const d = await api(`/v9/projects/${PROJECT_ID}/env/${e.id}?teamId=${TEAM_ID}`, { method: "DELETE" });
    console.log(`  ${key}: 删除旧值 ${d.status === 200 || d.status === 204 ? "OK" : d.status}`);
  }
  const r = await api(`/v10/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`, {
    method: "POST",
    body: JSON.stringify({
      key,
      value,
      type: "encrypted",
      target: ["production", "preview", "development"],
    }),
  });
  const body = await r.json().catch(() => ({}));
  const ok = r.status === 200 || r.status === 201;
  console.log(
    `  ${key}: ${ok ? "已写入(encrypted)" : "失败 " + r.status + " " + JSON.stringify(body).slice(0, 200)}`
  );
  return ok;
}

console.log(`=== 写入环境变量到 ${PROJECT_ID} ===`);
let allOk = true;
for (const [k, v] of pairs) {
  if (!(await upsertEnv(k, v))) allOk = false;
}

if (!allOk) {
  console.error("有变量写入失败，已中止。");
  process.exit(2);
}

// 打印最终清单
const list = await (await api(`/v9/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`)).json();
console.log("\n当前环境变量清单:");
(list.envs || []).forEach((e) => console.log(`  - ${e.key} [${e.type}]`));

if (!doDeploy) {
  console.log("\n(未指定 --deploy，跳过部署)");
  process.exit(0);
}

console.log("\n=== 触发生产部署 ===");
const d = await api(`/v13/deployments?teamId=${TEAM_ID}`, {
  method: "POST",
  body: JSON.stringify({
    name: "xm-tech-portal",
    project: PROJECT_ID,
    target: "production",
  }),
});
const dj = await d.json().catch(() => ({}));
console.log("  状态:", d.status, dj.id || JSON.stringify(dj).slice(0, 200));
process.exit(d.ok ? 0 : 3);
