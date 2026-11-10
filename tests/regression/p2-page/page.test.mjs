/**
 * p2-page 回归套件（站点默认内容与关键常量，tag=p2）。
 *
 * 覆盖：
 *   - defaultContents 非空且结构完整（后台 CMS 首次播种的数据基座）
 *   - defaultSite 关键字段非空
 *   - 关键常量存在：PAYCFG_*、SCHED_PAY_ID、BALANCE_PAY_ID、SYSTEM_CONTENT_TYPES
 *
 * 通过 loadTs 导入真实的 lib/data/defaults、lib/payconfig（桩 store）、lib/data/types。
 * 任一断言失败 -> exit(1)；全部通过 -> exit(0)。
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTs, supportFile } from "../../_support/loadTs.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_MOCK = supportFile("mock-store.mjs");

const results = [];
function check(name, cond, detail) {
  if (cond) {
    console.log(`  PASS  ${name}`);
    results.push({ name, ok: true });
  } else {
    console.log(`  FAIL  ${name}${detail ? `  ::  ${detail}` : ""}`);
    results.push({ name, ok: false });
  }
}

async function main() {
  const storeMock = { "@/lib/store": STORE_MOCK };
  const { defaultContents, defaultSite } = await loadTs("@/lib/data/defaults", {});
  const { PAYCFG_TYPE, PAYCFG_ID, SCHED_PAY_ID, BALANCE_PAY_ID } = await loadTs("@/lib/payconfig", { mock: storeMock });
  const { SYSTEM_CONTENT_TYPES } = await loadTs("@/lib/data/types", {});

  // ---- P2-1 defaultContents ----
  console.log("[p2-page] P2-1 defaultContents");
  const contents = defaultContents();
  check("defaultContents 非空数组", Array.isArray(contents) && contents.length > 0, `len=${Array.isArray(contents) ? contents.length : "n/a"}`);
  const wellFormed = contents.every((c) => c && c.id && c.type && c.title);
  check("每条内容具备 id/type/title", wellFormed);
  const types = new Set(contents.map((c) => c.type));
  check("覆盖 product/solution/case/news", ["product", "solution", "case", "news"].every((t) => types.has(t)), [...types].join(","));

  // ---- P2-2 defaultSite ----
  console.log("[p2-page] P2-2 defaultSite");
  const site = defaultSite();
  check(
    "defaultSite 关键字段非空",
    site && site.companyName && site.slogan && site.phone && site.email && site.icp,
    JSON.stringify(site)
  );

  // ---- P2-3 关键常量 ----
  console.log("[p2-page] P2-3 关键常量");
  check("PAYCFG_TYPE === 'paycfg'", PAYCFG_TYPE === "paycfg", String(PAYCFG_TYPE));
  check("PAYCFG_ID === 'paycfg-main'", PAYCFG_ID === "paycfg-main", String(PAYCFG_ID));
  check("SCHED_PAY_ID === 'sched'", SCHED_PAY_ID === "sched", String(SCHED_PAY_ID));
  check("BALANCE_PAY_ID === 'balance'", BALANCE_PAY_ID === "balance", String(BALANCE_PAY_ID));
  check(
    "SYSTEM_CONTENT_TYPES 含 order/paycfg",
    Array.isArray(SYSTEM_CONTENT_TYPES) && SYSTEM_CONTENT_TYPES.includes("order") && SYSTEM_CONTENT_TYPES.includes("paycfg"),
    Array.isArray(SYSTEM_CONTENT_TYPES) ? SYSTEM_CONTENT_TYPES.join(",") : "n/a"
  );

  const failed = results.filter((r) => !r.ok);
  console.log(`\n[p2-page] 通过 ${results.length - failed.length}/${results.length}`);
  if (failed.length) {
    console.log(`[p2-page] 失败项：${failed.map((f) => f.name).join("; ")}`);
    console.log("[p2-page] EXIT 1");
    process.exit(1);
  }
  console.log("[p2-page] EXIT 0");
  process.exit(0);
}

main().catch((e) => {
  console.error("[p2-page] 运行异常：", e);
  console.log("[p2-page] EXIT 1");
  process.exit(1);
});
