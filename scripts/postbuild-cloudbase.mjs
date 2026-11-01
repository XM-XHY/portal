/**
 * CloudBase 构建后处理：把 standalone 产物补齐为「可直接运行」的完整包。
 *
 * Next.js 的 output: "standalone" 只产出最小化的 server.js，
 * 不会自动带上 .next/static（前端静态资源）与 public/（你的静态文件），
 * 这两者缺失会导致页面能打开但样式/脚本 404。
 *
 * 用法：BUILD_TARGET=cloudbase npm run build && node scripts/postbuild-cloudbase.mjs
 */
import { cp, mkdir, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

async function has(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await has(standalone))) {
    console.error(
      "[postbuild] 未找到 .next/standalone，请先设置 BUILD_TARGET=cloudbase 后再执行 npm run build"
    );
    process.exit(1);
  }

  // 1) 前端静态资源：.next/static -> .next/standalone/.next/static
  const srcStatic = path.join(root, ".next", "static");
  const dstStaticParent = path.join(standalone, ".next");
  if (await has(srcStatic)) {
    await mkdir(dstStaticParent, { recursive: true });
    await cp(srcStatic, path.join(dstStaticParent, "static"), { recursive: true });
    console.log("[postbuild] ✓ 已复制 .next/static");
  } else {
    console.warn("[postbuild] ! 跳过：未找到 .next/static");
  }

  // 2) 公共文件：public -> .next/standalone/public
  const srcPublic = path.join(root, "public");
  if (await has(srcPublic)) {
    await cp(srcPublic, path.join(standalone, "public"), { recursive: true });
    console.log("[postbuild] ✓ 已复制 public");
  } else {
    console.warn("[postbuild] ! 跳过：未找到 public（本项目可能无需公共静态文件）");
  }

  const serverJs = path.join(standalone, "server.js");
  if (!existsSync(serverJs)) {
    console.error("[postbuild] 未找到 .next/standalone/server.js，产物不完整");
    process.exit(1);
  }

  console.log("[postbuild] ✓ standalone 产物就绪：" + path.relative(root, serverJs));
  console.log("[postbuild] 提示：部署时请保留 scf_bootstrap（需 LF 换行且有可执行权限）");
}

main().catch((e) => {
  console.error("[postbuild] 失败：", e);
  process.exit(1);
});
