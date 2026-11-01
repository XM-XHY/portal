/**
 * CloudBase 构建入口（跨平台）。
 *
 * 为什么不直接在 package.json 里写 `BUILD_TARGET=cloudbase next build`：
 * 这种 Unix 变量语法在 Windows 的 cmd/PowerShell 下无法解析，会让 Windows 开发者
 * 无法本地验证。这里用 Node 注入环境变量再调用 next，Windows / macOS / Linux 通吃，
 * 也省掉一个 cross-env 依赖。
 *
 * 用法：npm run build:cloudbase
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";

const root = process.cwd();
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");

if (!existsSync(nextBin)) {
  console.error("[build] 未找到 next 可执行文件，请先执行 npm install");
  process.exit(1);
}

console.log("[build] BUILD_TARGET=cloudbase，产出 standalone 产物…");

const res = spawnSync(process.execPath, [nextBin, "build"], {
  stdio: "inherit",
  env: { ...process.env, BUILD_TARGET: "cloudbase" },
});

process.exit(res.status ?? 1);
