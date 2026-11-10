import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    setupFiles: [path.join(root, "tests/unit/setup.ts")],
    // 覆盖率仅统计本次补全用例覆盖的纯函数模块，避免被整个代码库稀释。
    coverage: {
      include: [
        "**/lib/pay-grant.ts",
        "**/lib/session.ts",
        "**/lib/work-session.ts",
        "**/lib/payconfig.ts",
        "**/lib/pay-access.ts",
        "**/lib/rate-limit.ts",
        "**/lib/sheet.ts",
        "**/lib/orders.ts",
      ],
      // 覆盖率门禁：低于阈值即判红（阻断），防止「有用例但不覆盖关键分支」的空转。
      // 阈值按当前实测值向下取整设定，随用例补强逐版上调。
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
    },
    // exceljs 是 CJS 大包，交给 Node 原生 require 加载，
    // 避免走 Vite 转换缓存（沙箱环境下会因写盘受限 EPERM 丢测试文件）。
    server: {
      deps: {
        external: ["exceljs"],
      },
    },
  },
  // 沙箱 brokered-fs 会间歇拦截 Vitest/Vite 的转换缓存写盘（EPERM），导致部分测试文件收集失败。
  // 把 Vite 缓存目录从系统临时目录挪到项目内，规避受限路径。
  cacheDir: path.join(root, "node_modules", ".vite-cache"),
  cache: false,
  resolve: {
    alias: {
      "@": root,
    },
  },
});
