#!/usr/bin/env node
/**
 * 校验 quanke.html 里高中题库是否已正确注入并合并进 SUBJECTS。
 * 做法：把 SUBJECTS 定义与 HS_DATA 注入块原样取出，在同一个 Function 作用域里求值，
 *      让真实的合并 IIFE 跑一遍，然后统计结果——不改动任何文件。
 *
 * 用法：node scripts/verify-quanke-hs.mjs
 * 退出码：0 全部通过；1 存在失败项
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = path.join(ROOT, "assets", "works", "quanke.html");
const START_MARK = "/* === HS_DATA START";
const END_MARK = "/* === HS_DATA END === */";
const HS_GRADES = ["高一上", "高一下", "高二上", "高二下", "高三"];

const html = fs.readFileSync(TARGET, "utf8");

/** 从 start 位置做括号匹配，取出 `{ ... }` 整段 */
function extractBraced(src, startIdx) {
  let depth = 0;
  for (let i = startIdx; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return src.slice(startIdx, i + 1);
    }
  }
  throw new Error("括号未闭合");
}

const subjDecl = "const SUBJECTS = ";
const subjIdx = html.indexOf(subjDecl);
if (subjIdx < 0) fail("找不到 SUBJECTS 定义");

let subjCode;
try {
  const braceStart = html.indexOf("{", subjIdx);
  subjCode = subjDecl + extractBraced(html, braceStart);
} catch (e) {
  fail("SUBJECTS 解析失败：" + e.message);
}

const sIdx = html.indexOf(START_MARK);
const eIdx = html.indexOf(END_MARK);
if (sIdx < 0 || eIdx < 0) fail("找不到 HS_DATA 注入标记（尚未注入？）");
const hsCode = html.slice(sIdx, eIdx + END_MARK.length);

let SUBJECTS;
try {
  // 在同一作用域执行：先定义 SUBJECTS，再跑 HS_DATA 的合并 IIFE
  const result = new Function(`${subjCode}\n${hsCode}\nreturn { SUBJECTS, HS_DATA };`)();
  SUBJECTS = result.SUBJECTS;
} catch (e) {
  fail("求值失败（合并逻辑有语法/运行错误）：" + e.message);
}

// ---------- 统计 ----------
const rows = [];
let totalHighKp = 0;
let totalHighQ = 0;
let brokenSubjects = [];

for (const subj of Object.keys(SUBJECTS)) {
  const versions = SUBJECTS[subj].versions || {};
  let highKp = 0;
  let highQ = 0;
  let baseKp = 0;
  const grades = new Set();

  for (const ver of Object.keys(versions)) {
    const bank = versions[ver].bank || {};
    const vmx = versions[ver].vmx || {};
    for (const k of Object.keys(bank)) {
      if (k.startsWith("高中·")) {
        highKp++;
        highQ += Object.keys(bank[k] || {}).length;
        const g = vmx[k];
        if (g) grades.add(g);
      } else {
        baseKp++;
      }
    }
  }
  if (highKp > 0) {
    totalHighKp += highKp;
    totalHighQ += highQ;
    if (grades.size === 0) brokenSubjects.push(`${subj}（高中知识点缺年级映射）`);
  }
  rows.push({
    学科: subj,
    版本数: Object.keys(versions).length,
    原有知识点: baseKp,
    高中知识点: highKp,
    高中题目: highQ,
    高中年级: Array.from(grades).sort((a, b) => HS_GRADES.indexOf(a) - HS_GRADES.indexOf(b)).join("/") || "-"
  });
}

// ---------- 输出 ----------
console.log("quanke.html 高中题库校验");
console.log("=".repeat(78));
for (const r of rows) {
  console.log(
    `  ${r.学科.padEnd(3, "　")} ｜版本${String(r.版本数).padStart(2)} ｜原有 ${String(r.原有知识点).padStart(3)} ｜高中 ${String(r.高中知识点).padStart(3)} 知识点 / ${String(r.高中题目).padStart(3)} 题 ｜${r.高中年级}`
  );
}
console.log("=".repeat(78));
console.log(`  高中合计：${totalHighKp} 知识点 / ${totalHighQ} 题`);

// ---------- 断言 ----------
const checks = [];
const expectSubjects = ["数学", "语文", "英语", "物理", "化学", "生物", "历史", "地理", "道法"];
for (const s of expectSubjects) {
  const r = rows.find((x) => x.学科 === s);
  checks.push([`${s} 已注入高中内容`, !!r && r.高中知识点 > 0]);
}
checks.push(["九科全部有高中内容", rows.filter((r) => r.高中知识点 > 0).length === 9]);
checks.push([`高中知识点总数 ≥ 150（实际 ${totalHighKp}）`, totalHighKp >= 150]);
checks.push([`高中题目总数 ≥ 450（实际 ${totalHighQ}）`, totalHighQ >= 450]);
checks.push(["原有小学/初中知识点未被破坏", rows.every((r) => r.原有知识点 > 0)]);
checks.push(["高中知识点年级映射完整", brokenSubjects.length === 0]);
checks.push(["allGrades 排序已含高中年级", /"高一上"/.test(html) && /"高三"/.test(html)]);
checks.push(["注入块唯一（无重复声明）", html.split("const HS_DATA =").length === 2]);

console.log("");
let failed = 0;
for (const [name, ok] of checks) {
  console.log(`  ${ok ? "✅" : "❌"} ${name}`);
  if (!ok) failed++;
}
if (brokenSubjects.length) console.log("  ⚠ " + brokenSubjects.join("；"));

console.log("");
if (failed === 0) {
  console.log(`全部通过（${checks.length}/${checks.length}）`);
  process.exit(0);
} else {
  console.log(`存在 ${failed} 项失败`);
  process.exit(1);
}

function fail(msg) {
  console.error("✗ " + msg);
  process.exit(1);
}
