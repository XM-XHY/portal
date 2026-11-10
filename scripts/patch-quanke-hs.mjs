#!/usr/bin/env node
/**
 * 把高中全科题库注入 assets/works/quanke.html（幂等，可重复执行）
 *
 * 背景：quanke.html 是「数字员工制作空间」交付的离线包，其 SUBJECTS 只覆盖
 * 小学 + 初中。若直接从制作空间重新覆盖该文件，本脚本做过的改造会丢失——
 * 届时**重新执行本脚本一次即可全部恢复**，不需要手工重贴。
 *
 * 本脚本做三件事：
 *   1. 读取 assets/works/_hs/*.js（9 科数据源），生成 HS_DATA 常量；
 *   2. 注入「合并进 SUBJECTS」的 IIFE（插在 `let curSubj = ` 之前）；
 *   3. 修补 allGrades() 里的 ord 数组，追加高中年级排序。
 *
 * 用法：node scripts/patch-quanke-hs.mjs [--check]
 *   --check  只检查是否已注入并报告统计，不写文件
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HS_DIR = path.join(ROOT, "assets", "works", "_hs");
const TARGET = path.join(ROOT, "assets", "works", "quanke.html");

/** 数据文件名 → SUBJECTS 里的学科键（高中思想政治复用初中的「道法」键） */
const KEY_MAP = { 政治: "道法" };
/** 注入顺序（决定学科按钮出现顺序） */
const ORDER = ["数学", "语文", "英语", "物理", "化学", "生物", "历史", "地理", "政治"];

const START_MARK = "/* === HS_DATA START";
const END_MARK = "/* === HS_DATA END === */";
const HS_GRADES = ["高一上", "高一下", "高二上", "高二下", "高三"];

const checkOnly = process.argv.includes("--check");

// ---------- 1. 收集数据 ----------
if (!fs.existsSync(TARGET)) {
  console.error(`✗ 找不到目标文件：${TARGET}`);
  process.exit(1);
}

const HS_DATA = {};
const stats = [];
for (const name of ORDER) {
  const file = path.join(HS_DIR, `${name}.js`);
  if (!fs.existsSync(file)) {
    console.warn(`! 跳过 ${name}：缺少 ${path.relative(ROOT, file)}`);
    continue;
  }
  delete require.cache[require.resolve(file)];
  const mod = require(file);
  const key = KEY_MAP[name] || name;
  HS_DATA[key] = mod;

  let kp = 0;
  let q = 0;
  for (const ver of Object.keys(mod)) {
    for (const k of Object.keys(mod[ver].bank || {})) {
      kp += 1;
      q += Object.keys(mod[ver].bank[k] || {}).length;
    }
  }
  stats.push({ 学科: name, 键: key, 教材版本: Object.keys(mod).join("/"), 知识点: kp, 题目: q });
}

const totalKp = stats.reduce((a, s) => a + s.知识点, 0);
const totalQ = stats.reduce((a, s) => a + s.题目, 0);

// ---------- 2. 生成注入块 ----------
function buildBlock() {
  const json = JSON.stringify(HS_DATA);
  return `${START_MARK}（由 scripts/patch-quanke-hs.mjs 自动生成，请勿手改）=== */
// 高中全科题库：与小学/初中同一套结构，通过 vmx 映射到高中年级。
// 合并策略：挂到该学科「已有的每个教材版本」下，保证用户切换版本时不丢高中内容。
// 注意：只影响**显示名**，存储键与云端同步仍用原学科名「道法」，避免历史数据错位。
const SUBJ_DISPLAY = { "道法": "政治" };

const HS_DATA = ${json};

(function mergeHighSchool() {
  var HS_ERR_POOL = ["概念不清", "审题偏差", "知识遗漏", "方法不当", "计算失误", "表述不规范", "时间不够", "其他"];
  for (var subj in HS_DATA) {
    var src = HS_DATA[subj];
    if (!SUBJECTS[subj]) {
      SUBJECTS[subj] = { errs: HS_ERR_POOL.slice(), versions: {} };
    }
    var versions = SUBJECTS[subj].versions || (SUBJECTS[subj].versions = {});
    // 目标版本：该学科已有哪些版本就全部挂上；若一个都没有，退回数据里声明的版本
    var targets = Object.keys(versions);
    if (!targets.length) { targets = Object.keys(src); }
    for (var ti = 0; ti < targets.length; ti++) {
      var ver = targets[ti];
      var payload = src[ver] || src[Object.keys(src)[0]];
      if (!payload) { continue; }
      if (!versions[ver]) { versions[ver] = { bank: {}, vmx: {} }; }
      var bank = versions[ver].bank || (versions[ver].bank = {});
      var vmx = versions[ver].vmx || (versions[ver].vmx = {});
      for (var k in payload.bank) { bank[k] = payload.bank[k]; }
      for (var m in payload.vmx) { vmx[m] = payload.vmx[m]; }
    }
  }
})();
${END_MARK}`;
}

// ---------- 3. 读写目标文件 ----------
let html = fs.readFileSync(TARGET, "utf8");
const beforeLen = Buffer.byteLength(html, "utf8");
const injected = html.includes(START_MARK);

// 3a. 注入 / 替换 HS_DATA 块
const block = buildBlock();
const anchor = 'let curSubj = "数学";';
if (!html.includes(anchor)) {
  console.error("✗ 找不到锚点 `let curSubj = \"数学\";`，离线包结构可能已变，请人工确认后再注入");
  process.exit(2);
}

if (injected) {
  const s = html.indexOf(START_MARK);
  const e = html.indexOf(END_MARK);
  if (e < 0) {
    console.error("✗ 找到 START 标记但缺少 END 标记，文件可能被手工改坏，请先修复");
    process.exit(3);
  }
  html = html.slice(0, s) + block + html.slice(e + END_MARK.length);
} else {
  html = html.replace(anchor, block + "\n" + anchor);
}

// 3b. 修补 allGrades 的 ord 数组（补高中年级排序）
const ordRe = /const ord=\[([^\]]*)\];/;
const ordMatch = html.match(ordRe);
if (ordMatch) {
  const inner = ordMatch[1];
  if (!inner.includes('"高一上"')) {
    // 「九下」之后、「小学」之前插入高中年级，另外在「高考」处补一个分组
    const nextInner = inner
      .replace('"九下",', '"九下","高一上","高一下","高二上","高二下","高三",')
      .replace('"中考"', '"中考","高考"');
    html = html.replace(ordRe, `const ord=[${nextInner}];`);
  }
} else {
  console.warn("! 未找到 allGrades 的 ord 数组，年级排序可能不含高中（页面仍可用）");
}

// 3c. 学科显示名映射（只改显示层，存储键不变）
const displayPatches = [
  ["b.textContent=s;", "b.textContent=(SUBJ_DISPLAY[s]||s);", "学科按钮显示名"],
  ["e.textContent=curSubj;", "e.textContent=(SUBJ_DISPLAY[curSubj]||curSubj);", "顶部学科名显示"]
];
for (const [from, to, label] of displayPatches) {
  if (html.includes(to)) continue; // 已打过
  if (!html.includes(from)) {
    console.warn(`! 未找到「${label}」的原始代码，跳过（显示名可能仍是「道法」）`);
    continue;
  }
  html = html.replace(from, to);
}

// 3d. 学段文案（幂等：已是新文案则跳过）
const copyPatches = [
  ["（9 科 · 小学+初中全覆盖）", "（9 科 · 小学+初中+高中全覆盖）"],
  ["9 科离线包（小学 + 初中全覆盖）", "9 科离线包（小学 + 初中 + 高中全覆盖）"],
  ["真题特训 / 中考专练", "真题特训 / 中考·高考专练"],
  ["// ===================== 全小学+初中题库（基础/变式/拔高） =====================",
   "// ===================== 全小学+初中题库（基础/变式/拔高；高中题库由 patch-quanke-hs.mjs 注入）====================="]
];
for (const [from, to] of copyPatches) {
  if (html.includes(to)) continue;
  if (html.includes(from)) html = html.replace(from, to);
}

// ---------- 4. 输出 ----------
console.log("高中题库注入统计");
console.log("─".repeat(64));
for (const s of stats) {
  console.log(`  ${s.学科.padEnd(3, "　")} → ${s.键.padEnd(3, "　")} ｜ ${String(s.知识点).padStart(3)} 知识点 ｜ ${String(s.题目).padStart(3)} 题 ｜ ${s.教材版本}`);
}
console.log("─".repeat(64));
console.log(`  合计：${totalKp} 知识点 / ${totalQ} 题`);
console.log(`  状态：${injected ? "已存在注入块 → 本次为替换更新" : "首次注入"}`);

if (checkOnly) {
  console.log("  （--check 模式，未写文件）");
  process.exit(0);
}

fs.writeFileSync(TARGET, html, "utf8");
const afterLen = Buffer.byteLength(html, "utf8");
console.log(`  写入：${path.relative(ROOT, TARGET)}  ${(beforeLen / 1024).toFixed(0)} KB → ${(afterLen / 1024).toFixed(0)} KB`);
