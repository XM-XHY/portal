/**
 * next/headers 桩：lib/session.ts 顶层的 `import { cookies } from "next/headers"`
 * 在测试进程里不需要真实实现（我们只测 signSession / verifyToken）。提供一个
 * 无害的 cookies() 即可，避免加载整个 Next 运行期。
 */
export function cookies() {
  return { get: () => undefined, set: () => {}, delete: () => {} };
}
