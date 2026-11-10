/**
 * 运行时密钥解析的公共约定（SEC-03 加固的落地约定）。
 *
 * 背景：CloudBase 云托管只在「容器运行时」注入环境变量，源码构建的构建机上没有这些密钥；
 * 而 Next.js 的 `next build` 会加载服务端模块并做静态生成，若模块在「加载时」就解析密钥
 * 并 fail-fast，部署会以 `Failed to collect page data for /` 直接失败（部署 026 build_failed）。
 *
 * 因此统一约定三条：
 * 1. 密钥一律「延迟到真正使用的那一刻」解析，模块加载期不得求值；
 * 2. 运行期（next start / 容器运行时）缺密钥仍然 fail-fast，绝不回退到静态弱密钥；
 * 3. 构建期（next build）缺密钥不阻塞构建 —— 构建期不签发任何可用凭据，
 *    产物在运行期会用真实密钥重新计算。
 */
import crypto from "node:crypto";

/**
 * Next.js 在 `next build` 期间设置的环境变量值。
 * 见 node_modules/next/dist/build/index.js（process.env.NEXT_PHASE = PHASE_PRODUCTION_BUILD）。
 */
const BUILD_PHASE = "phase-production-build";

/**
 * 是否处于构建期（`next build`）。
 *
 * `next build` 会在「收集页面数据 / 静态生成」之前设置 `process.env.NEXT_PHASE`，
 * 该变量会随 fork 出来的构建工作进程一起继承（createStaticWorker 的 forkOptions.env）；
 * 而运行期（`next start` / 容器运行时）不存在这个变量，因此不会误判成构建期。
 */
export function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === BUILD_PHASE;
}

/** 进程内缓存的构建期占位密钥。 */
let cachedBuildSecret: string | null = null;

/**
 * 构建期占位密钥：每个进程随机生成一次。
 *
 * 用于**签名类**密钥（会话 / 票据）的构建期占位：
 * 必须是不可预测的随机值 —— 构建期若产出任何带签名的凭据（如会话 Cookie），
 * 固定常量会被攻击者伪造，随机值则无法伪造（且运行期本就会用真实密钥重签）。
 */
export function buildPhaseSecret(): string {
  if (!cachedBuildSecret) {
    cachedBuildSecret = crypto.randomBytes(32).toString("hex");
  }
  return cachedBuildSecret;
}
