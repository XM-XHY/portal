/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // 演示项目跳过 ESLint 阻塞；生产请保留并修复告警
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
