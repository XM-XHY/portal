#!/usr/bin/env node
/**
 * 网络分区 / 网关超时 验证 stub（RL-02 失败不静默降级）。
 *
 * 目的：用「永不响应」的 mock fetch 模拟支付网关网络分区，验证
 *   lib/http.ts 的 fetchWithTimeout 在超时后**显式抛出 TimeoutError**，
 *   而**不是**回落到「免费放行 / 默认成功 / 吞异常」。
 *
 * 本脚本直接 import 真实的 lib/http.ts（Node 22 的 --experimental-strip-types 支持），
 * 验证的是真实代码，而非副本。
 *
 * 运行（隔离环境、不触达任何真实网关）：
 *   node --experimental-strip-types tests/chaos/network-partition.stub.mjs
 */

import { fetchWithTimeout, TimeoutError } from "../../lib/http.ts";

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    console.error(`  ❌ ${msg}`);
  }
}

async function main() {
  console.log("=== 网络分区超时验证（mock，不联网） ===");

  // ---- 用例 1：网关挂起 → 必须超时抛错，绝不静默成功 ----
  console.log("\n[用例1] 模拟支付网关永不响应（网络分区）");
  let fetchCalled = 0;
  const originalFetch = globalThis.fetch;
  // mock：永不 resolve / 永不 reject，纯挂起
  globalThis.fetch = async () => {
    fetchCalled++;
    return new Promise(() => {}); // 永久挂起，逼出超时路径
  };

  const HANG_URL = "http://unreachable.example/partition";
  let threw = null;
  let silentSuccess = false;
  try {
    const res = await fetchWithTimeout(HANG_URL, { method: "GET" }, 200); // 200ms 短超时
    // 若走到这里说明被「静默成功」了 —— 这是 RL-02 违规
    silentSuccess = true;
    console.error("    [反模式] fetchWithTimeout 在网关挂起时竟返回了响应：", res?.status);
  } catch (e) {
    threw = e;
  }

  assert(fetchCalled >= 1, `超时路径确实发起了出向请求（fetch 被调用 ${fetchCalled} 次）`);
  assert(threw instanceof TimeoutError, `超时后抛出 TimeoutError（实际: ${threw?.constructor?.name ?? threw}）`);
  assert(!silentSuccess, "超时后未静默成功 / 未回落免费放行（RL-02 合规）");

  // ---- 用例 2：网关正常快速响应 → 正常返回（对照） ----
  console.log("\n[用例2] 模拟网关 10ms 正常响应（对照）");
  globalThis.fetch = async (url, init) => {
    fetchCalled++;
    return new Response(JSON.stringify({ ok: true, url }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  let okRes = null;
  let okErr = null;
  try {
    okRes = await fetchWithTimeout("http://mock.example/ok", { method: "GET" }, 5000);
  } catch (e) {
    okErr = e;
  }
  assert(!okErr, `正常响应未被误判超时（${okErr?.constructor?.name ?? "无错误"}）`);
  assert(okRes && okRes.status === 200, `正常响应返回 200（status=${okRes?.status}）`);

  // 还原
  globalThis.fetch = originalFetch;

  console.log(`\n=== 结果：${passed} 通过 / ${failed} 失败 ===`);
  if (failed > 0) process.exit(1);
  console.log("✅ RL-02 验证通过：超时显式报错，未静默降级。");
}

main().catch((e) => {
  console.error("stub 运行异常:", e);
  process.exit(1);
});
