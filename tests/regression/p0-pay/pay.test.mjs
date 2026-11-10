/**
 * p0-pay 回归套件（核心付费 / 资损链路，tag=p0）。
 *
 * 覆盖：
 *   - 付费墙 fail-closed（配置缺失一律 402）与免费商品放行互补分支
 *   - markOrderPaid 回调金额校验（不一致 / 缺失 / 负数拒绝，一致放行）
 *   - SEC-04 同账号绑定：已付订单权益不可被其他账号领取（数据层不变量）
 *   - grantEntitlement 幂等
 *
 * 通过 loadTs 导入真实的 lib/pay-access、lib/payconfig、lib/orders、lib/work-db，
 * 用内存替身隔离 @/lib/store（付费域）与 @/lib/data + @/lib/work-plans（作品域）。
 * 任一断言失败 -> exit(1)；全部通过 -> exit(0)。
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadTs, supportFile } from "../../_support/loadTs.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_MOCK = supportFile("mock-store.mjs");
const WORK_CLIENT_MOCK = supportFile("mock-work-client.mjs");
const WORK_PLANS_MOCK = supportFile("mock-work-plans.mjs");

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
  const store = await loadTs("@/lib/store", { mock: storeMock });
  const { getPayConfig } = await loadTs("@/lib/payconfig", { mock: storeMock });
  const { requirePaidAccess } = await loadTs("@/lib/pay-access", { mock: storeMock });
  const { newOrder, saveOrder, markOrderPaid } = await loadTs("@/lib/orders", { mock: storeMock });

  const workMock = { "@/lib/data": WORK_CLIENT_MOCK, "@/lib/work-plans": WORK_PLANS_MOCK };
  const data = await loadTs("@/lib/data", { mock: workMock });
  const { grantEntitlement } = await loadTs("@/lib/work-db", { mock: workMock });

  // ---- P0-1 付费墙 fail-closed ----
  console.log("[p0-pay] P0-1 付费墙 fail-closed");
  store.resetStore();
  const denied = await requirePaidAccess({ headers: new Headers() }, "p1");
  check("配置缺失时返回 402", denied && denied.ok === false && denied.status === 402, JSON.stringify(denied));

  // ---- P0-2 免费商品放行（互补分支）----
  console.log("[p0-pay] P0-2 免费商品放行");
  store.resetStore();
  store.setContents([
    {
      id: "paycfg-main",
      type: "paycfg",
      title: "产品付费配置",
      body: JSON.stringify({
        qrImageUrl: "",
        qrNote: "扫码支付",
        items: { p1: { paid: false, amount: 0 } },
      }),
    },
  ]);
  const free = await requirePaidAccess({ headers: new Headers() }, "p1");
  check("免费商品(paid:false)放行 ok:true mode:free", free && free.ok === true && free.mode === "free", JSON.stringify(free));

  // ---- P0-3..6 markOrderPaid 金额校验 ----
  console.log("[p0-pay] P0-3..6 markOrderPaid 金额校验");
  store.resetStore();
  const order = newOrder({
    productId: "p1",
    productTitle: "回归样例",
    amount: 20,
    provider: "wechat",
  });
  await saveOrder(order);
  const fen = order.amountFen; // 2000

  check("金额不一致 -> null", (await markOrderPaid(order.id, "T1", fen + 1)) === null);
  check("金额缺失 -> null", (await markOrderPaid(order.id, "T1")) === null);
  check("金额为负 -> null", (await markOrderPaid(order.id, "T1", -1)) === null);
  const paid = await markOrderPaid(order.id, "T1", fen);
  check("金额一致 -> status=paid", paid && paid.status === "paid", JSON.stringify(paid));

  // ---- P0-7 SEC-04 同账号绑定 ----
  console.log("[p0-pay] P0-7 SEC-04 同账号绑定");
  data.resetWorkTables();
  const userA = "user-A", userB = "user-B", orderId = "order-sec04";
  const eA = await grantEntitlement(userA, "pro", 30, orderId);
  check("A 领取后权益归属 A", eA && eA.user_id === userA, JSON.stringify(eA));
  const eB = await grantEntitlement(userB, "pro", 30, orderId);
  check("B 用同一订单无法夺取权益（仍归属 A）", eB && eB.user_id === userA, JSON.stringify(eB));
  const rows = data._tables().work_entitlements.filter((r) => r.order_id === orderId);
  check("同一订单仅 1 条权益记录", rows.length === 1, `count=${rows.length}`);

  // ---- P0-8 幂等 ----
  console.log("[p0-pay] P0-8 grantEntitlement 幂等");
  const eA2 = await grantEntitlement(userA, "pro", 30, orderId);
  check("重复发放返回同一记录", eA2 && eA2.id === eA.id, JSON.stringify(eA2));
  check("权益记录数仍为 1", data._tables().work_entitlements.filter((r) => r.order_id === orderId).length === 1);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n[p0-pay] 通过 ${results.length - failed.length}/${results.length}`);
  if (failed.length) {
    console.log(`[p0-pay] 失败项：${failed.map((f) => f.name).join("; ")}`);
    console.log("[p0-pay] EXIT 1");
    process.exit(1);
  }
  console.log("[p0-pay] EXIT 0");
  process.exit(0);
}

main().catch((e) => {
  console.error("[p0-pay] 运行异常：", e);
  console.log("[p0-pay] EXIT 1");
  process.exit(1);
});
