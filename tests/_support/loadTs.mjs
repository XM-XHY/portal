/**
 * 轻量级 TypeScript 即时转译 + 路径别名解析 + Mock 注入加载器。
 *
 * 背景：本项目业务代码是 TypeScript 且使用 `@/` 路径别名，纯 `node xxx.mjs`
 * 无法直接 import。本加载器利用已安装的 `typescript` 包在运行时把真实 .ts 源码
 * 转译为 ESM 并写入临时目录，同时将 `@/` 别名改写成临时缓存路径；被测模块的
 * 数据库 / Next 依赖通过 `mock` / `stub` 映射隔离，从而让冒烟 / 回归套件在
 * 「不修改任何业务源码、不依赖打包器」的前提下，真正导入并断言核心逻辑。
 *
 * 仅用于测试资产，不参与生产构建。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, mkdtempSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const SUPPORT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SUPPORT_DIR, "..", ".."); // tests/_support -> 仓库根
const TS_EXTS = [".ts", ".tsx"];

/** 返回 tests/_support 下某个支持文件的绝对路径 */
export function supportFile(name) {
  return path.join(SUPPORT_DIR, name);
}

function cacheFile(root, key) {
  // key 形如 "@/lib/foo" -> <root>/lib/foo.mjs
  return path.join(root, key.slice(2) + ".mjs");
}
function cacheUrl(root, key) {
  return pathToFileURL(cacheFile(root, key)).href;
}
function fileUrl(p) {
  return pathToFileURL(p).href;
}

function resolveSource(key) {
  const rel = key.slice(2).replace(/\.(ts|tsx|js|mjs|cjs)$/i, "");
  for (const ext of TS_EXTS) {
    const p = path.join(PROJECT_ROOT, rel + ext);
    if (existsSync(p)) return p;
  }
  for (const ext of TS_EXTS) {
    const p = path.join(PROJECT_ROOT, rel, "index" + ext);
    if (existsSync(p)) return p;
  }
  throw new Error(`[loadTs] 找不到源码：${key}`);
}

/**
 * 清理 import / 类型专用语法，避免转译后产生「模块未导出该成员」运行时错误：
 *  - 整条 `import type ... from '...'` 删除
 *  - 类型重导出 `export type {...} from '...'` 删除
 *  - import / export-from 语句括号内的内联 `type X` / `type X as Y` 剔除
 * （`interface` / `export type X = ...` / `export const` 等由 transpileModule 自动擦除，不动。）
 */
function cleanImports(src) {
  let s = src.replace(/import\s+type\s+[^;]*;?/g, "");
  s = s.replace(/export\s+type\s+[^;]*\bfrom\s*['"][^'"]*['"]\s*;?/g, "");
  s = s.replace(/(import|export)\b([^;]*?)\bfrom\b/g, (_m, kw, body) => {
    const cleaned = body.replace(
      /\btype\s+[A-Za-z_$][\w$]*(\s+as\s+[A-Za-z_$][\w$]*)?/g,
      ""
    );
    return kw + cleaned + "from";
  });
  return s;
}

/** 收集源码中出现的所有模块说明符（from 'x' 与副作用 import 'x'） */
function collectSpecifiers(src) {
  const specs = [];
  let m;
  const reFrom = /from\s*(['"])([^'"]+)\1/g;
  while ((m = reFrom.exec(src))) specs.push(m[2]);
  const reSide = /\bimport\s*(['"])([^'"]+)\1/g;
  while ((m = reSide.exec(src))) specs.push(m[2]);
  return specs;
}

/** 把源码里的说明符改写成目标 URL（临时缓存 / mock / stub / 裸模块原样保留） */
function rewriteSpecifiers(src, fromDir, ctx) {
  const reImportFrom = /(\bimport\b[^'"]*?\bfrom\s*)(['"])([^'"]+)\2/g;
  let out = src.replace(reImportFrom, (_m, pre, q, spec) => {
    const t = ctx.target(spec, fromDir);
    return `${pre}${q}${t.url}${q}`;
  });
  const reExportFrom = /(\bexport\b[^'"]*?\bfrom\s*)(['"])([^'"]+)\2/g;
  out = out.replace(reExportFrom, (_m, pre, q, spec) => {
    const t = ctx.target(spec, fromDir);
    return `${pre}${q}${t.url}${q}`;
  });
  const reSide = /(\bimport\s*)(['"])([^'"]+)\2/g;
  out = out.replace(reSide, (_m, pre, q, spec) => {
    const t = ctx.target(spec, fromDir);
    return `${pre}${q}${t.url}${q}`;
  });
  return out;
}

function makeCtx(mock, stub, root) {
  return {
    mock,
    stub,
    root,
    seen: new Map(),
    target(spec, fromDir) {
      // 先把 @/ 与相对说明符归一到规范 key（@/lib/x），以便 mock/stub 按规范 key 命中
      let key = null;
      if (spec.startsWith("@/")) key = spec;
      else if (spec.startsWith(".")) {
        const abs = path.resolve(fromDir, spec);
        const rel = path.relative(PROJECT_ROOT, abs).split(path.sep).join("/");
        key = "@/" + rel;
      }
      if (key && this.mock[key]) return { url: fileUrl(this.mock[key]), build: null };
      if (key && this.stub[key]) return { url: fileUrl(this.stub[key]), build: null };
      if (key) return { url: cacheUrl(this.root, key), build: key };
      // 裸模块：先查 mock/stub（如 next/headers），否则原样留给 Node 解析
      if (this.mock[spec]) return { url: fileUrl(this.mock[spec]), build: null };
      if (this.stub[spec]) return { url: fileUrl(this.stub[spec]), build: null };
      return { url: spec, build: null };
    },
  };
}

function ensureBuilt(key, ctx) {
  if (ctx.seen.has(key)) return ctx.seen.get(key);
  const srcPath = resolveSource(key);
  const fromDir = path.dirname(srcPath);
  const raw = readFileSync(srcPath, "utf8");

  // 先递归构建子依赖（保证其缓存文件先于父模块存在）
  for (const spec of collectSpecifiers(raw)) {
    const t = ctx.target(spec, fromDir);
    if (t.build) ensureBuilt(t.build, ctx);
  }

  let cleaned = cleanImports(raw);
  cleaned = rewriteSpecifiers(cleaned, fromDir, ctx);

  const out = ts.transpileModule(cleaned, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      isolatedModules: true,
      verbatimModuleSyntax: false,
    },
  }).outputText;

  const cf = cacheFile(ctx.root, key);
  mkdirSync(path.dirname(cf), { recursive: true });
  writeFileSync(cf, out);

  const p = import(cacheUrl(ctx.root, key));
  ctx.seen.set(key, p);
  return p;
}

/**
 * 导入一个 `@/` 别名指向的真实 TS 模块（转译 + 别名解析后返回其命名空间）。
 * @param {string} spec 形如 "@/lib/orders"
 * @param {object} [opts]
 * @param {Record<string,string>} [opts.mock] 说明符 -> 真实 .mjs 文件路径（整模块替换为 mock）
 * @param {Record<string,string>} [opts.stub] 裸模块说明符 -> 真实 .mjs 文件路径（如 next/headers）
 * @param {boolean} [opts.fresh] 使用独立临时根，得到全新模块实例（模块级缓存会重置，用于不同环境变量场景）
 */
export async function loadTs(spec, opts = {}) {
  if (!spec.startsWith("@/")) {
    throw new Error("[loadTs] 入口说明符必须以 '@/' 开头");
  }
  const mock = opts.mock || {};
  const stub = opts.stub || {};
  // 入口说明符本身若已映射为 mock / stub，直接导入替身，避免对其转译
  if (mock[spec]) return import(fileUrl(mock[spec]));
  if (stub[spec]) return import(fileUrl(stub[spec]));
  const root = opts.fresh
    ? mkdtempSync(path.join(os.tmpdir(), "xmts-"))
    : DEFAULT_ROOT;
  const ctx = makeCtx(mock, stub, root);
  return ensureBuilt(spec, ctx);
}

const DEFAULT_ROOT = mkdtempSync(path.join(os.tmpdir(), "xmts-"));
