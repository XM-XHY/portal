/**
 * 冒烟测试：部署后可在数分钟内判定「付费门禁是否仍然可测 / 未被意外敞开」。
 *
 * 仅覆盖最小核心链路（不替代回归套件）：
 *   1) requirePaidAccess 在配置缺失时 fail-closed（一律 402，绝不默认放行）
 *   2) getPayConfig 默认返回空 items（付费墙未配置时不做任何放行）
 *   3) markOrderPaid 金额校验（不一致 / 负数 / 缺失一律拒绝置为已付）
 *
 * 通过 loadTs 导入真实的 lib/pay-access、lib/payconfig、lib/orders，
 * 用内存版 @/lib/store 替身隔离数据库。脚本末尾以 process.exit(code) 收尾：
 * 任一断言失败 -> exit(1)；全部通过 -> exit(0)。
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTs, supportFile } from "../_support/loadTs.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_MOCK = path.join(__dirname, "..", "_support", "mock-store.mjs");
const mock = { "@/lib/store": STORE_MOCK };

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
  const store = await loadTs("@/lib/store", { mock });
  const { getPayConfig } = await loadTs("@/lib/payconfig", { mock });
  const { requirePaidAccess } = await loadTs("@/lib/pay-access", { mock });
  const { newOrder, saveOrder, markOrderPaid } = await loadTs("@/lib/orders", { mock });

  console.log("[smoke] 1) 付费门禁 fail-closed（配置缺失时一律 402）");
  store.resetStore();
  const denied = await requirePaidAccess({ headers: new Headers() }, "p1");
  check(
    "requirePaidAccess 缺失配置时返回 402",
    denied && denied.ok === false && denied.status === 402,
    JSON.stringify(denied)
  );

  console.log("[smoke] 2) getPayConfig 默认返回空 items（无付费放行）");
  store.resetStore();
  const cfg = await getPayConfig();
  check(
    "getPayConfig 默认 items 为空对象",
    cfg && typeof cfg.items === "object" && Object.keys(cfg.items).length === 0,
    JSON.stringify(cfg && cfg.items)
  );
  check(
    "getPayConfig 默认 qrNote 非空",
    cfg && typeof cfg.qrNote === "string" && cfg.qrNote.length > 0
  );

  console.log("[smoke] 3) markOrderPaid 回调金额校验");
  store.resetStore();
  const order = newOrder({
    productId: "p1",
    productTitle: "冒烟样例",
    amount: 10,
    provider: "wechat",
  });
  await saveOrder(order);
  const amountFen = order.amountFen; // 应为 1000

  const mismatch = await markOrderPaid(order.id, "T1", amountFen + 1);
  check("金额不一致时拒绝置为已付（返回 null）", mismatch === null);

  const negative = await markOrderPaid(order.id, "T1", -5);
  check("金额为负时拒绝置为已付（返回 null）", negative === null);

  const missing = await markOrderPaid(order.id, "T1");
  check("金额缺失时拒绝置为已付（返回 null）", missing === null);

  const ok = await markOrderPaid(order.id, "T1", amountFen);
  check(
    "金额一致时置为已付（status=paid）",
    ok && ok.status === "paid",
    JSON.stringify(ok)
  );

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n[smoke] 通过 ${results.length - failed.length}/${results.length}`
  );
  if (failed.length) {
    console.log(`[smoke] 失败项：${failed.map((f) => f.name).join("; ")}`);
    console.log("[smoke] EXIT 1");
    process.exit(1);
  }
  console.log("[smoke] EXIT 0");
  process.exit(0);
}

main().catch((e) => {
  console.error("[smoke] 运行异常：", e);
  console.log("[smoke] EXIT 1");
  process.exit(1);
});
