#!/usr/bin/env node
/**
 * 阶梯加压基线骨架（PF-01 性能资产 / 回归门禁）。
 *
 * ⚠️ 隔离环境声明：本脚本**默认不发起任何网络请求**。只有显式设置
 *    `RUN_LOAD_TEST=1` 才会真正加压，且目标必须指向**隔离的 standalone / mock
 *    端点**（禁止指向生产）。本仓库当前未实跑，结论以「设计口径」记录于
 *    docs/perf/baseline.md。
 *
 * 使用方法：
 *   node tests/perf/load-baseline.mjs                 # 仅打印计划，不联网
 *   RUN_LOAD_TEST=1 \
 *     TARGET_BASE_URL=http://localhost:3000 \
 *     TARGET_PATH=/api/orders \
 *     METHOD=POST \
 *     BODY='{"provider":"mock"}' \
 *     STAGES="10,30,60,100,150,200" \
 *     DURATION_PER_STAGE_MS=120000 \
 *     node tests/perf/load-baseline.mjs
 *
 * 纯 Node 内置能力（fetch / perf_hooks），无第三方依赖。
 */

import { performance } from "node:perf_hooks";

const RUN = process.env.RUN_LOAD_TEST === "1";
const TARGET_BASE_URL = process.env.TARGET_BASE_URL || "http://localhost:3000";
const TARGET_PATH = process.env.TARGET_PATH || "/api/orders";
const METHOD = process.env.METHOD || "GET";
const BODY = process.env.BODY || "";
const STAGES = (process.env.STAGES || "10,30,60,100,150,200")
  .split(",")
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => Number.isFinite(n) && n > 0);
const DURATION_PER_STAGE_MS = parseInt(process.env.DURATION_PER_STAGE_MS || "120000", 10);
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || "5000", 10);

/** 分位计算（线性插值） */
function percentile(sortedMs, p) {
  if (sortedMs.length === 0) return 0;
  const idx = (sortedMs.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedMs[lo];
  return sortedMs[lo] + (sortedMs[hi] - sortedMs[lo]) * (idx - lo);
}

/** 单档加压：在 duration 内按 targetRps 持续发送，回收延迟样本 */
async function runStage(targetRps, durationMs) {
  const latencies = [];
  const errors = { timeout: 0, http5xx: 0, other: 0 };
  const endAt = performance.now() + durationMs;
  const intervalMs = 1000 / targetRps;

  async function hitOnce() {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
    const start = performance.now();
    try {
      const res = await fetch(`${TARGET_BASE_URL}${TARGET_PATH}`, {
        method: METHOD,
        headers: { "Content-Type": "application/json" },
        body: BODY ? BODY : undefined,
        signal: ac.signal,
      });
      clearTimeout(t);
      latencies.push(performance.now() - start);
      if (res.status >= 500) errors.http5xx++;
      return res;
    } catch (e) {
      clearTimeout(t);
      latencies.push(performance.now() - start);
      if (e.name === "AbortError") errors.timeout++;
      else errors.other++;
      throw e;
    }
  }

  const workers = [];
  let nextTick = performance.now();
  while (performance.now() < endAt) {
    const now = performance.now();
    if (now >= nextTick) {
      workers.push(hitOnce().catch(() => {}));
      nextTick += intervalMs;
    } else {
      // 让出事件循环，避免忙等
      await new Promise((r) => setImmediate(r));
    }
  }
  await Promise.allSettled(workers);

  const sorted = latencies.slice().sort((a, b) => a - b);
  return {
    targetRps,
    samples: latencies.length,
    p50: Math.round(percentile(sorted, 0.5) * 100) / 100,
    p95: Math.round(percentile(sorted, 0.95) * 100) / 100,
    p99: Math.round(percentile(sorted, 0.99) * 100) / 100,
    errors,
    errorRate:
      Math.round(((errors.timeout + errors.http5xx + errors.other) / Math.max(1, latencies.length)) * 10000) / 100,
  };
}

async function main() {
  console.log("=== 阶梯加压基线骨架 ===");
  console.log(`目标: ${METHOD} ${TARGET_BASE_URL}${TARGET_PATH}`);
  console.log(`阶梯 RPS: [${STAGES.join(", ")}]  每档时长: ${DURATION_PER_STAGE_MS}ms  单请求超时: ${TIMEOUT_MS}ms`);
  console.log(`联网实跑开关 RUN_LOAD_TEST=1 ? ${RUN ? "是（将真实加压）" : "否（仅打印计划，不联网）"}`);

  if (!RUN) {
    console.log("\n[DRY-RUN] 未设置 RUN_LOAD_TEST=1，不发起请求。请在隔离环境显式开启后实跑。");
    console.log("[DRY-RUN] 预期产物：每档 P50/P95/P99 + 错误率 + 拐点 QPS（回填 docs/perf/baseline.md）。");
    return;
  }

  // 预热（不计入统计）
  console.log("\n[预热 15s] ...");
  await runStage(Math.min(...STAGES), 15000);

  const report = [];
  for (const rps of STAGES) {
    console.log(`\n--- 阶梯 ${rps} RPS / ${DURATION_PER_STAGE_MS}ms ---`);
    const r = await runStage(rps, DURATION_PER_STAGE_MS);
    report.push(r);
    console.log(
      `samples=${r.samples} p50=${r.p50}ms p95=${r.p95}ms p99=${r.p99}ms ` +
        `errRate=${r.errorRate}% (timeout=${r.errors.timeout},5xx=${r.errors.http5xx},other=${r.errors.other})`,
    );
    // 门禁：P95 超 800ms 或错误率超 0.5% → 停止（拐点）
    if (r.p95 > 800 || r.errorRate > 0.5) {
      console.log("⚠️ 触及 SLO 拐点（P95>800ms 或 错误率>0.5%），停止加压。");
      break;
    }
  }

  console.log("\n=== 基线报告（请回填 docs/perf/baseline.md） ===");
  console.table(report);
}

main().catch((e) => {
  console.error("基线脚本异常退出:", e);
  process.exit(1);
});
