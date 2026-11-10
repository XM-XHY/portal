/**
 * Next.js 构建配置
 *
 * 支持两种部署目标，用 BUILD_TARGET 环境变量区分：
 *   - 未设置 / "vercel"（默认）：标准输出，部署在 Vercel
 *   - "cloudbase"：standalone 输出 + 关闭图片优化，部署在腾讯云 CloudBase（HTTP 云函数/云托管）
 *
 * 之所以做成条件式而不是无条件开启 standalone：
 * 本项目生产环境当前跑在 Vercel 上，standalone 会改变产物结构与运行方式，
 * 为避免影响现网，仅在明确指定 BUILD_TARGET=cloudbase 时启用。
 */
const target = (process.env.BUILD_TARGET || "vercel").toLowerCase();
const forCloudbase = target === "cloudbase";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // 演示项目跳过 ESLint 阻塞；生产请保留并修复告警
    ignoreDuringBuilds: true,
  },
  // 文档/表格解析库含动态 require，让 Node 原生加载而非打包。
  // 注意：xlsx@0.18.5 存在 high 级漏洞且无官方修复版，已替换为 exceljs（见 lib/sheet.ts）。
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse", "mammoth", "exceljs"],
  },
  compress: true,
  poweredByHeader: false,
};

if (forCloudbase) {
  // CloudBase 的 HTTP 云函数/云托管需要独立可运行产物（不依赖完整 node_modules）
  nextConfig.output = "standalone";
  // 云函数环境无 Sharp，开启图片优化会导致构建或运行时报错。
  // 本项目未使用 next/image（已核实），故此配置无副作用。
  nextConfig.images = { unoptimized: true };
}

export default nextConfig;
