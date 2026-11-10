/**
 * 外部依赖 HTTP 可靠性原语：超时 / 指数退避重试 / 简单熔断。
 *
 * 背景（PF-02）：支付网关、数据层等外部调用原先裸用 fetch，无超时无重试无熔断，
 * 一旦对端无响应会一直挂起请求线程。本模块把可靠性策略集中于此，供 lib/payment.ts 等复用。
 *
 * 使用约束（重要）：
 *  - 写操作（下单 create / 退款 refund）只加超时、绝不重试，避免重复扣款；
 *  - 只有幂等读操作（查单 query / 验签 certCheck）才允许 withRetry；
 *  - CircuitBreaker 为可选增强，默认不强制接入。
 */

export class TimeoutError extends Error {
  constructor(message = "request timeout") {
    super(message);
    this.name = "TimeoutError";
  }
}

/** 带超时的 fetch：超时主动 abort 并抛 TimeoutError，保证不永久挂起。 */
export async function fetchWithTimeout(
  input: string | URL | Request,
  init: RequestInit = {},
  timeoutMs = 5000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new TimeoutError(`[http] 请求超时 ${timeoutMs}ms: ${String(input)}`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export type RetryOptions = {
  retries?: number;
  baseMs?: number;
  factor?: number;
  maxMs?: number;
  shouldRetry?: (err: unknown) => boolean;
};

const defaultShouldRetry = (err: unknown): boolean =>
  err instanceof TimeoutError ||
  (err as any)?.name === "TypeError" ||
  (err as any)?.code === "ECONNRESET";

/** 指数退避重试：仅用于幂等读操作；写操作请勿使用。 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const {
    retries = 2,
    baseMs = 200,
    factor = 2,
    maxMs = 5000,
    shouldRetry = defaultShouldRetry,
  } = opts;
  let attempt = 0;
  let lastErr: unknown;
  while (attempt <= retries) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !shouldRetry(err)) throw err;
      const delay = Math.min(maxMs, baseMs * Math.pow(factor, attempt));
      await new Promise((r) => setTimeout(r, delay));
      attempt++;
    }
  }
  throw lastErr;
}

/** 简单熔断器：连续失败达到阈值后快速失败，冷却后半开探测。可选使用。 */
export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  constructor(
    private readonly threshold = 5,
    private readonly cooldownMs = 30_000
  ) {}

  private isOpen(): boolean {
    if (this.failures < this.threshold) return false;
    if (Date.now() - this.openedAt >= this.cooldownMs) {
      this.failures = 0; // 半开：放行一次探测
      return false;
    }
    return true;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.isOpen()) throw new Error("[http] 熔断打开，快速失败");
    try {
      const r = await fn();
      this.failures = 0;
      return r;
    } catch (e) {
      this.failures++;
      if (this.failures >= this.threshold) this.openedAt = Date.now();
      throw e;
    }
  }
}
