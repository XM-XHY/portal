/**
 * 构建期 / 运行期判定。
 *
 * 背景（SEC-03 加固引入的构建回归）：
 *   `lib/data/hash.ts` 等模块原本在**模块加载时**就解析运行时密钥，
 *   并在 NODE_ENV=production 且缺密钥时 fail-fast 抛错。
 *   但 `next build` 阶段 NODE_ENV 同样是 production，而云托管的环境变量
 *   只在**容器运行时**注入、构建机上没有 → 静态生成首页时直接抛
 *   "[hash] FATAL: 生产环境未配置 ADMIN_PASSWORD_SALT"，
 *   构建报 "Failed to collect page data for /" 而失败。
 *
 * 判定依据：
 *   Next.js 14 在 `next build` 期间会设置 process.env.NEXT_PHASE =
 *   'phase-production-build'（见 node_modules/next/dist/build/index.js）。
 *   运行期（next start / 容器进程）该变量不存在。
 *
 * 用途：
 *   - 构建期：允许使用仅构建期有效的占位值，保证构建可通过；
 *     占位值不会写入任何生产数据（构建期不落库）。
 *   - 运行期：仍然 fail-fast，缺密钥即抛错，**绝不回退到弱默认密钥**。
 *     这是 SEC-03 的原始意图，不可为了通过构建而削弱。
 */
export function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

/**
 * 构建期占位密钥。
 *
 * 仅在 next build 阶段、且对应环境变量缺失时使用。
 * 特点：固定字符串（便于复现）、与任何生产密钥都不相同（不会误被当作真实密钥）。
 */
export const BUILD_PHASE_PLACEHOLDER = "twb-build-phase-placeholder-not-a-real-secret";
