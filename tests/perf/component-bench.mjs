#!/usr/bin/env node
/**
 * 组件级性能基线（隔离环境实跑，不联网、不接触生产）
 *
 * 为什么做组件级而不是 HTTP 压测：
 *   本项目的热路径成本主要集中在「密码学运算 + 表格序列化 + 文本解析」这几处纯计算上，
 *   它们与应用服务器解耦，可以在本机直接量出真实耗时与分位数，结论比 dev 模式压 HTTP 更可信。
 *   HTTP 级阶梯加压见 tests/perf/load-baseline.mjs（需 standalone 环境）。
 *
 * 用法：
 *   node --experimental-strip-types tests/perf/component-bench.mjs
 *
 * 输出：每项的 p50/p95/p99 与吞吐，并与 docs/SLO.md 的阈值对照，超阈标 FAIL。
 * 退出码：0 全部达标；1 存在超阈项。
 */

import crypto from "node:crypto";
import { performance } from "node:perf_hooks";

// 直接用 Node 类型擦除加载真实的业务模块，确保测的是生产代码而不是复制品
const { buildWorkbookBuffer, readRows, parseCsv } = await import("../../lib/sheet.ts");

const results = [];

function record(name, samplesMs, budget, unit = "ms") {
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const p = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
  const p50 = p(0.5);
  const p95 = p(0.95);
  const p99 = p(0.99);
  const total = samplesMs.reduce((a, b) => a + b, 0);
  const opsPerSec = total > 0 ? (samplesMs.length / total) * 1000 : 0;
  const ok = p95 <= budget;
  results.push({ name, p50, p95, p99, opsPerSec, budget, ok, unit });
  console.log(
    `${ok ? "✓" : "✗"} ${name.padEnd(34)} p50=${p50.toFixed(2)}${unit} p95=${p95.toFixed(2)}${unit} ` +
      `p99=${p99.toFixed(2)}${unit} ${opsPerSec.toFixed(0)} ops/s (预算 p95≤${budget}${unit})`
  );
}

function timeIt(fn, iterations) {
  const samples = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    fn();
    samples.push(performance.now() - t0);
  }
  return samples;
}

async function timeItAsync(fn, iterations) {
  const samples = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    await fn();
    samples.push(performance.now() - t0);
  }
  return samples;
}

/* ---------------- 1. 密码学热路径 ---------------- */

const SECRET = "bench-secret-32-bytes-long-abcdef";
const MSG = "payload-with-some-moderate-length-用于模拟票据内容";

// HMAC 签名（付费票据 / 会话 cookie 同款算法）
record("HMAC-SHA256 签名", timeIt(() => crypto.createHmac("sha256", SECRET).update(MSG).digest("base64url"), 5000), 1);

// HMAC 验签（含 timingSafeEqual，登录/票据校验必经）
const expected = crypto.createHmac("sha256", SECRET).update(MSG).digest();
record(
  "HMAC-SHA256 验签(+timingSafeEqual)",
  timeIt(() => {
    const actual = crypto.createHmac("sha256", SECRET).update(MSG).digest();
    return crypto.timingSafeEqual(actual, expected);
  }, 5000),
  1
);

// 口令哈希（管理员登录、改密）
record(
  "SHA-256 口令哈希",
  timeIt(() => crypto.createHash("sha256").update(SECRET + "user-password").digest("hex"), 5000),
  1
);

/* ---------------- 2. 微信回调解密热路径 ---------------- */

const API_V3_KEY = "0123456789abcdef0123456789abcdef";
const nonce = "abcdef123456";
const aad = "transaction";
const plain = JSON.stringify({
  mchid: "1900000001",
  out_trade_no: "o_bench_0001",
  transaction_id: "4200000000000000000000000001",
  trade_state: "SUCCESS",
  amount: { total: 3000, payer_total: 3000, currency: "CNY" },
});

// 预先生成密文（模拟微信侧产物）
const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(API_V3_KEY, "utf8"), Buffer.from(nonce, "utf8"));
cipher.setAAD(Buffer.from(aad, "utf8"));
const ciphertextB64 = Buffer.concat([
  Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]),
  cipher.getAuthTag(),
]).toString("base64");

// 解密（每个支付回调必经一次）
record(
  "微信回调用 AES-256-GCM 解密",
  timeIt(() => {
    const buf = Buffer.from(ciphertextB64, "base64");
    const authTag = buf.subarray(buf.length - 16);
    const data = buf.subarray(0, buf.length - 16);
    const d = crypto.createDecipheriv("aes-256-gcm", Buffer.from(API_V3_KEY, "utf8"), Buffer.from(nonce, "utf8"));
    d.setAuthTag(authTag);
    d.setAAD(Buffer.from(aad, "utf8"));
    return Buffer.concat([d.update(data), d.final()]).toString("utf8");
  }, 5000),
  1
);

/* ---------------- 3. RSA 验签（最贵的密码学操作） ---------------- */

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const rsaMsg = `1700000000\nnonce123\n{"id":"evt-1"}\n`;
const rsaSig = crypto.createSign("RSA-SHA256").update(rsaMsg, "utf8").sign(privateKey, "base64");

record(
  "微信回调 RSA-SHA256 验签",
  timeIt(() => {
    const v = crypto.createVerify("RSA-SHA256");
    v.update(rsaMsg, "utf8");
    return v.verify(publicKey, rsaSig, "base64");
  }, 2000),
  3
);

/* ---------------- 4. 表格序列化（替换 xlsx→exceljs 后的性能回归点） ---------------- */

// 构造一个接近真实「全校课表导出」的规模：40 个班 × 8 节 × 6 天
const DAYS = 6;
const PERIODS = 8;
const CLASSES = 40;
const sheetSpecs = Array.from({ length: CLASSES }, (_, ci) => {
  const rows = [["班级课表", ...Array.from({ length: DAYS }, (_, d) => `周${"一二三四五六日"[d]}`)]];
  for (let p = 0; p < PERIODS; p++) {
    const row = [`第${p + 1}节\n08:0${p}`];
    for (let d = 0; d < DAYS; d++) row.push(`语文\n张老师 · A10${(ci + d) % 9}`);
    rows.push(row);
  }
  return { name: `班级${ci + 1}`, rows, colWidths: [14, ...Array(DAYS).fill(18)], rowHeights: [22, ...Array(PERIODS).fill(34)] };
});

record(
  `Excel 导出（${CLASSES} 表 × ${PERIODS} 节）`,
  await timeItAsync(() => buildWorkbookBuffer(sheetSpecs), 8),
  1500
);

// 读回同一份文件（上传解析路径）
const exported = await buildWorkbookBuffer(sheetSpecs);
record("Excel 读取解析（单表）", await timeItAsync(() => readRows(exported), 30), 200);

/* ---------------- 5. CSV 解析（知识库/名册上传） ---------------- */

const csvLines = ["姓名,性别,总分,村居,备注"];
for (let i = 0; i < 10000; i++) csvLines.push(`学生${i},男,${500 + (i % 200)},某村,"备注,含逗号${i}"`);
const csvText = csvLines.join("\r\n");
const csvBytes = new TextEncoder().encode(csvText);

record("CSV 解析（1 万行）", timeIt(() => parseCsv(csvText), 10), 600);
record("CSV 读取分派（1 万行）", await timeItAsync(() => readRows(csvBytes), 10), 800);

/* ---------------- 汇总 ---------------- */

const failed = results.filter((r) => !r.ok);
console.log(`\n汇总：${results.length} 项基准，达标 ${results.length - failed.length}，超阈 ${failed.length}`);
if (failed.length) {
  for (const f of failed) console.log(`  ✗ ${f.name}：p95 ${f.p95.toFixed(2)} > 预算 ${f.budget}`);
  process.exit(1);
}
process.exit(0);
