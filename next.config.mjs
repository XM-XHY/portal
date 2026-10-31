/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // 演示项目跳过 ESLint 阻塞；生产请保留并修复告警
    ignoreDuringBuilds: true,
  },
  // 文档解析库含动态 require/worker，让 Node 原生加载而非打包
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse", "mammoth", "xlsx"],
  },
};

export default nextConfig;
