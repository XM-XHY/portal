import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import http from "node:http";
import { fetchWithTimeout, withRetry, CircuitBreaker, TimeoutError } from "@/lib/http";

/**
 * 容灾演练（隔离环境实跑，不联网、不接触生产）
 *
 * 对应审查阻断项：
 *   - RL-01 故障注入 / 混沌 / 容灾演练资产全零
 *   - RL-02 失败静默降级（网关失败不得当成成功、更不得放开付费墙）
 *   - PF-02 外部依赖无超时 / 重试 / 熔断
 *
 * 手法：起一个本地可控 HTTP 服务模拟「慢网关 / 会挂的依赖」，验证客户端侧的降级语义。
 */

let server: http.Server;
let base = "";
let hits = 0;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    hits++;
    if (req.url === "/slow") {
      // 故意慢于客户端超时
      setTimeout(() => {
        res.writeHead(200);
        res.end("late");
      }, 400);
      return;
    }
    if (req.url === "/boom") {
      res.writeHead(500);
      res.end("upstream error");
      return;
    }
    if (req.url === "/reset") {
      req.socket.destroy(); // 模拟连接被重置
      return;
    }
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

describe("外部依赖容灾：超时 / 重试 / 熔断", () => {
  it("网关迟迟不响应 → 在超时预算内抛 TimeoutError，不会永久挂起", async () => {
    const t0 = Date.now();
    await expect(fetchWithTimeout(`${base}/slow`, {}, 80)).rejects.toBeInstanceOf(TimeoutError);
    const elapsed = Date.now() - t0;
    // 必须显著早于服务端的 400ms 响应，证明是我们主动 abort 而非等到对方返回
    expect(elapsed).toBeLessThan(300);
  });

  it("正常响应不受超时逻辑影响", async () => {
    const res = await fetchWithTimeout(`${base}/ok`, {}, 2000);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("超时可被 withRetry 重试，且重试次数可观测（不会无限重试）", async () => {
    hits = 0;
    await expect(
      withRetry(() => fetchWithTimeout(`${base}/slow`, {}, 60), { retries: 2, baseMs: 10 })
    ).rejects.toBeInstanceOf(TimeoutError);
    // 首次 + 2 次重试 = 3 次请求
    expect(hits).toBe(3);
  });

  it("非重试类错误立即抛出，不浪费重试预算", async () => {
    hits = 0;
    const err = new Error("参数错误");
    await expect(
      withRetry(
        () => {
          hits++;
          throw err;
        },
        { retries: 3, baseMs: 10 }
      )
    ).rejects.toBe(err);
    expect(hits).toBe(1);
  });

  it("withRetry 在后续尝试成功时返回成功结果（读操作可自愈）", async () => {
    let attempt = 0;
    const r = await withRetry(
      async () => {
        attempt++;
        if (attempt < 3) throw new TimeoutError();
        return "recovered";
      },
      { retries: 3, baseMs: 10 }
    );
    expect(r).toBe("recovered");
    expect(attempt).toBe(3);
  });

  it("熔断器：连续失败达阈值后快速失败，冷却后允许半开探测", async () => {
    const cb = new CircuitBreaker(2, 60); // threshold=2, cooldown=60ms
    const boom = async () => {
      throw new TimeoutError();
    };

    // 前两次真实执行并失败
    for (let i = 0; i < 2; i++) {
      await expect(cb.run(boom)).rejects.toBeInstanceOf(TimeoutError);
    }
    // 第三次应被熔断拦下（错误信息区分于真实失败）
    const err = await cb.run(boom).catch((e: Error) => e);
    expect(String(err?.message || "")).toMatch(/熔断/);

    // 冷却后半开：允许一次探测
    await new Promise((r) => setTimeout(r, 90));
    await expect(cb.run(async () => "ok")).resolves.toBe("ok");
  });
});

describe("失败不得静默降级为放行", () => {
  it("付费墙在配置读取异常时保持 fail-closed（不给免费通行）", async () => {
    // 模拟存储层整体抛错（DB 不可达）
    vi.resetModules();
    vi.doMock("@/lib/payconfig", () => ({
      getPayConfig: async () => {
        throw new Error("DB unavailable");
      },
    }));
    vi.doMock("@/lib/pay-grant", () => ({
      grantFromRequest: () => "",
      verifyGrant: () => null,
    }));
    vi.doMock("@/lib/orders", () => ({ getOrder: async () => null }));
    vi.doMock("@/lib/payment", () => ({ getPaymentProvider: () => null }));

    const { requirePaidAccess } = await import("@/lib/pay-access");

    // 无论内部是抛错还是返回 402，关键断言是：绝不能拿到 ok:true
    let result: any = null;
    try {
      result = await requirePaidAccess({ headers: new Headers() }, "paid_product");
    } catch {
      result = { ok: false, status: 500 };
    }
    expect(result.ok).toBe(false);
    expect([402, 500]).toContain(result.status);

    vi.doUnmock("@/lib/payconfig");
    vi.doUnmock("@/lib/pay-grant");
    vi.doUnmock("@/lib/orders");
    vi.doUnmock("@/lib/payment");
    vi.resetModules();
  });
});
