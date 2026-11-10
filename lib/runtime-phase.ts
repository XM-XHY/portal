/**
 * 运行时密钥解析策略（SEC-03 加固的落地约定）。
 *
 * 背景：CloudBase 云托管只在「容器运行时」注入环境变量，源码构建的构建机上没有这些密钥；
 * 而 Next.js 的 `next build` 会加载服务端模块并做静态生成，若模块在「加载时」就解析密钥
 * 并 fail-fast，部署会以 `Failed to collect page data for /` 直接失败（部署 026 build_failed）。
 *
 * 因此统一约定三条：
 * 1. 密钥一律「延迟到真正使用的那一刻」解析，模块加载期不得求值；
 * 2. 运行期（next start / 容器运行时）缺密钥仍然 fail-fast，绝不回退到静态弱密钥；
 * 3. 构建期（next build）缺密钥不阻塞构建，沿用与本地开发一致的兜底值 ——
 *    构建期不会签发任何可用凭据（会话与票据都只在运行期的 API 路由里签发），
 *    产物在运行期会用真实密钥重新计算。
 */

/**
 * Next.js 在 `next build` 期间设置的环境变量值。
 * 见 node_modules/next/dist/build/index.js（process.env.NEXT_PHASE = PHASE_PRODUCTION_BUILD）。
 */
const BUILD_PHASE = "phase-production-build";

/**
 * 是否处于构建期（`next build`）。
 *
 * `next build` 会在「收集页面数据 / 静态生成」之前设置 `process.env.NEXT_PHASE`，
 * 该变量会随 fork 出来的构建工作进程一起继承；
 * 而运行期（`next start` / 容器运行时）不存在这个变量，因此不会误判。
 */
export function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === BUILD_PHASE;
}

/**
 * 构建期占位密钥。
 *
 * 仅在 next build 阶段、且对应环境变量缺失时使用。
 * 特点：固定字符串（便于复现）、与任何生产密钥都不相同（不会被误当作真实密钥）。
 * 构建期不会签发任何可用凭据，产物在运行期会用真实密钥重新计算。
 */
export const BUILD_PHASE_PLACEHOLDER = "twb-build-phase-placeholder-not-a-real-secret";
