/**
 * 契约验证器（P1：消费者驱动契约护栏）。
 *
 * 通过 loadTs 加载真实的 lib/orders、lib/payment、lib/work-plans（用内存替身隔离 @/lib/store），
 * 对「关键接口契约」做三类断言：
 *   1) 功能性：真实 newOrder 产出的 Order 形状、MockProvider 的 createNativePayment / verifyCallback
 *      返回形状，与契约一致；
 *   2) 静态：lib/payment.ts 的 PaymentProvider 接口声明、app/api/works/pay/[action]/route.ts 各分支
 *      响应字段，与契约一致；
 *   3) 双向：契约 JSON 中声明的字段必须是代码实际产出的子集（防止契约承诺代码给不出的字段，
 *      也防止代码偷偷删字段）。
 *
 * 任一断言失败 -> console 打印 FAIL 并 process.exit(1)；全部通过 -> exit(0)。
 * 本文件是「契约资产」，应当接入 CI（由其他人统加脚本，本文件不修改 package.json）。
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { loadTs, supportFile } from "../_support/loadTs.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
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

/** 读取真实源码（用于静态契约比对） */
function readSrc(rel) {
  return fs.readFileSync(path.join(PROJECT_ROOT, rel), "utf8");
}

/** 字段集合断言：契约里声明的每一个字段，真实代码都必须产出 */
function assertSubset(name, contractFields, realFields) {
  const missing = contractFields.filter((k) => !realFields.includes(k));
  check(`${name}：契约字段均为代码实际产出`, missing.length === 0, missing.length ? `缺: ${missing.join(",")}` : "");
}

async function main() {
  // 让 getPaymentProvider 返回 MockProvider（无需真实网关凭据）
  process.env.PAY_PROVIDER = "mock";

  const storeMock = { "@/lib/store": STORE_MOCK };
  const { newOrder } = await loadTs("@/lib/orders", { mock: storeMock });
  const { getPaymentProvider } = await loadTs("@/lib/payment", { mock: storeMock });
  const { getWorkPlan } = await loadTs("@/lib/work-plans"); // 纯函数，直接加载真实实现
  const contract = JSON.parse(fs.readFileSync(path.join(__dirname, "works-pay.pact.json"), "utf8"));

  /* ---------- 1) 功能性：Order 形状 ---------- */
  console.log("[contract] 1) Order 形状（功能性）");
  const order = newOrder({
    productId: "work_m",
    productTitle: "全科提分导师 · 月卡会员",
    amount: 29,
    provider: "mock",
    client: "web",
    reqId: "req-abc",
  });
  const required = contract.providerInterfaces.Order.requiredFields;
  check("newOrder 必含契约声明的全部字段", required.every((k) => k in order), `缺: ${required.filter((k) => !(k in order)).join(",")}`);
  check("amountFen = round(amount*100)", order.amountFen === Math.round(order.amount * 100), `got ${order.amountFen}`);
  check("reqId 透传存储", order.reqId === "req-abc");

  /* ---------- 2) 功能性：PaymentProvider（MockProvider 真实调用） ---------- */
  console.log("[contract] 2) PaymentProvider 形状（功能性，MockProvider）");
  const provider = getPaymentProvider();
  check("PAY_PROVIDER=mock 时返回 Provider", !!provider && typeof provider.createNativePayment === "function");
  const { codeUrl } = await provider.createNativePayment(order, "https://example.com");
  check("createNativePayment 返回 { codeUrl: string }", typeof codeUrl === "string" && codeUrl.length > 0);
  const cb = await provider.verifyCallback(JSON.stringify({ outTradeNo: "o1", tradeNo: "T1", amountFen: 2900 }), {});
  check(
    "verifyCallback 返回 { outTradeNo, tradeNo, paid, amountFen }",
    typeof cb.outTradeNo === "string" && typeof cb.tradeNo === "string" && typeof cb.paid === "boolean" && typeof cb.amountFen === "number",
    JSON.stringify(cb)
  );
  check("verifyCallback 金额透传 amountFen", cb.amountFen === 2900);

  /* ---------- 3) 静态：PaymentProvider 接口声明 ---------- */
  console.log("[contract] 3) PaymentProvider 接口声明（静态比对 lib/payment.ts）");
  const paySrc = readSrc("lib/payment.ts");
  check("PaymentProvider 接口声明 createNativePayment 返回 codeUrl:string",
    /createNativePayment\([\s\S]*?Promise<\{\s*codeUrl:\s*string/.test(paySrc));
  check("PaymentProvider 接口声明 verifyCallback 返回 outTradeNo/tradeNo/paid/amountFen",
    /verifyCallback\([\s\S]*?Promise<\{[\s\S]*?outTradeNo:\s*string[\s\S]*?tradeNo:\s*string[\s\S]*?paid:\s*boolean[\s\S]*?amountFen:\s*number/.test(paySrc));

  /* ---------- 4) 静态：路由各分支响应字段 ---------- */
  console.log("[contract] 4) 路由响应字段（静态比对 route.ts）");
  const routeSrc = readSrc("app/api/works/pay/[action]/route.ts");
  const createResp = routeSrc.slice(routeSrc.indexOf("orderId: order.id"), routeSrc.indexOf("orderId: order.id") + 400);
  const statusResp = routeSrc.slice(routeSrc.indexOf("paid: paid && granted"), routeSrc.indexOf("paid: paid && granted") + 400);
  const createFields = ["orderId", "codeUrl", "expiresAt", "amount", "plan", "days", "planName"].filter((k) => createResp.includes(k));
  const statusFields = ["paid", "orderPaid", "granted", "plan", "days", "planName", "expiresAt", "amount", "status"].filter((k) => statusResp.includes(k));
  const claimOkFields = ["paid", "plan", "days", "planName"].filter((k) => /return NextResponse\.json\(\s*\{\s*paid:\s*true/.test(routeSrc) && routeSrc.includes(k));

  /* ---------- 5) 双向：契约 ⊆ 代码实际产出 ---------- */
  console.log("[contract] 5) 契约 ↔ 代码 双向一致性");
  const createInteraction = contract.interactions.find((i) => i.id === "work-member-create");
  assertSubset("work-member-create", Object.keys(createInteraction.response.bodyShape), createFields);

  const claimInteraction = contract.interactions.find((i) => i.id === "work-member-claim");
  assertSubset("work-member-claim", Object.keys(claimInteraction.response.bodyShape), claimOkFields);
  const claim403 = claimInteraction.errorResponses.find((e) => e.status === 403);
  check("work-member-claim 契约声明 403 跨账号分支", !!claim403 && routeSrc.includes("o.work.userId !== uid"));

  const statusInteraction = contract.interactions.find((i) => i.id === "work-member-status");
  assertSubset("work-member-status", Object.keys(statusInteraction.response.bodyShape), statusFields);

  const payCbInteraction = contract.interactions.find((i) => i.id === "payment-callback-verify");
  assertSubset("payment-callback-verify", Object.keys(payCbInteraction.response.returns), ["outTradeNo", "tradeNo", "paid", "amountFen"]);

  /* ---------- 6) getWorkPlan 可被契约套餐命中（防止 planName 永远为空） ---------- */
  console.log("[contract] 6) 套餐一致性");
  check("getWorkPlan('m') 命中真实套餐", getWorkPlan("m")?.name === "月卡会员", JSON.stringify(getWorkPlan("m")));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n[contract] 通过 ${results.length - failed.length}/${results.length}`);
  if (failed.length) {
    console.log(`[contract] 失败项：${failed.map((f) => f.name).join("; ")}`);
    console.log("[contract] EXIT 1");
    process.exit(1);
  }
  console.log("[contract] EXIT 0");
  process.exit(0);
}

main().catch((e) => {
  console.error("[contract] 运行异常：", e);
  console.log("[contract] EXIT 1");
  process.exit(1);
});
