/**
 * 回归套件聚合器：依次运行 p0-pay / p1-admin / p2-page 三个子套件（各自以退出码表达成败），
 * 收集退出码，任一非 0 则整体 process.exit(1)；并生成 tests/RESULTS.md
 * （含时间戳、各套件通过/失败、退出码、失败摘要）。
 *
 * 用法：node tests/regression/run.mjs
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REGRESSION_DIR = __dirname;
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const RESULTS_PATH = path.join(REPO_ROOT, "tests", "RESULTS.md");

const SUITES = [
  { id: "p0-pay", name: "p0-pay（核心付费/资损）", path: path.join(REGRESSION_DIR, "p0-pay", "pay.test.mjs") },
  { id: "p1-admin", name: "p1-admin（后台鉴权/凭据）", path: path.join(REGRESSION_DIR, "p1-admin", "admin.test.mjs") },
  { id: "p2-page", name: "p2-page（默认内容/常量）", path: path.join(REGRESSION_DIR, "p2-page", "page.test.mjs") },
];

function runSuite(suite) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [suite.path], {
      cwd: REGRESSION_DIR,
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolve({ suite, code: code ?? 1, stdout, stderr }));
  });
}

function summarize(stdout) {
  const passes = (stdout.match(/^\s*PASS\b/gm) || []).length;
  const fails = (stdout.match(/^\s*FAIL\b/gm) || []).length;
  return { passes, fails, total: passes + fails };
}

async function main() {
  const startedAt = new Date();
  console.log(`[regression] 开始时间 ${startedAt.toISOString()}`);
  const reports = [];
  for (const suite of SUITES) {
    process.stdout.write(`[regression] 运行 ${suite.id} ... `);
    const r = await runSuite(suite);
    const s = summarize(r.stdout);
    const ok = r.code === 0;
    console.log(`${ok ? "PASS" : "FAIL"} (exit=${r.code}, ${s.passes} passed / ${s.fails} failed)`);
    reports.push({ ...r, summary: s, ok });
  }

  const anyFailed = reports.some((r) => !r.ok);
  const finishedAt = new Date();

  const lines = [];
  lines.push(`# 回归测试执行报告`);
  lines.push("");
  lines.push(`- 生成时间：${finishedAt.toISOString()}`);
  lines.push(`- 总结果：${anyFailed ? "❌ 存在失败套件" : "✅ 全部通过"}`);
  lines.push(`- 套件数：${reports.length}`);
  lines.push("");
  lines.push(`## 各套件结果`);
  lines.push("");
  lines.push(`| 套件 | 退出码 | 通过 | 失败 | 结果 |`);
  lines.push(`| --- | --- | --- | --- | --- |`);
  for (const r of reports) {
    lines.push(
      `| ${r.suite.id} | ${r.code} | ${r.summary.passes} | ${r.summary.fails} | ${r.ok ? "PASS" : "FAIL"} |`
    );
  }
  lines.push("");
  lines.push(`## 失败摘要`);
  lines.push("");
  const failedReports = reports.filter((r) => !r.ok);
  if (failedReports.length === 0) {
    lines.push(`无失败。`);
  } else {
    for (const r of failedReports) {
      lines.push(`### ${r.suite.id}（exit=${r.code}）`);
      lines.push("");
      const failLines = (r.stdout.match(/^\s*FAIL\b.*$/gm) || []).map((l) => `- ${l.trim()}`);
      if (failLines.length) failLines.forEach((l) => lines.push(l));
      if (r.stderr.trim()) {
        lines.push("");
        lines.push(`<details><summary>stderr</summary>`);
        lines.push("");
        lines.push("```");
        lines.push(r.stderr.trim());
        lines.push("```");
        lines.push("");
        lines.push(`</details>`);
      }
      lines.push("");
    }
  }
  lines.push(`---`);
  lines.push(`由 tests/regression/run.mjs 生成。`);

  fs.writeFileSync(RESULTS_PATH, lines.join("\n") + "\n", "utf8");
  console.log(`[regression] 报告已写入 ${path.relative(REPO_ROOT, RESULTS_PATH)}`);

  if (anyFailed) {
    console.log("[regression] EXIT 1");
    process.exit(1);
  }
  console.log("[regression] EXIT 0");
  process.exit(0);
}

main().catch((e) => {
  console.error("[regression] 聚合异常：", e);
  console.log("[regression] EXIT 1");
  process.exit(1);
});
