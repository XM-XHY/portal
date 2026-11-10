/**
 * 分布式限流（共享存储版）。
 *
 * 原来各接口都用 `globalThis.__lastXxx` 进程内 Map，云托管多实例部署时
 * 每个实例各有一份计数，攻击者换一个实例就能绕过限流。
 * 这里把计数桶写进共享 contents 表（type=rate，零 DDL，复用现有存储层），
 * 所有实例读写同一份数据；同时保留进程内一级缓存，让同一实例内的拒绝是严格且零延迟的。
 *
 * 说明：计数桶是「读-改-写」，跨实例并发下为最终一致的近似限流（可能瞬时多放几个请求），
 * 但足以防住刷接口/撞库；存储异常时自动降级到进程内计数，绝不因限流组件故障而 5xx。
 */
import crypto from "node:crypto";
import { getContent, saveContents, type ContentItem } from "@/lib/store";

type Bucket = { start: number; count: number; until: number };

const PREFIX = "rl_";
const local = new Map<string, Bucket>();

function idOf(key: string): string {
  return PREFIX + crypto.createHash("sha256").update(key).digest("hex").slice(0, 28);
}

function emptyBucket(now: number): Bucket {
  return { start: now, count: 0, until: 0 };
}

async function readShared(key: string): Promise<Bucket | null> {
  try {
    const it = await getContent(idOf(key));
    if (!it || it.type !== "rate") return null;
    const b = JSON.parse(it.body) as Bucket;
    if (!b || typeof b.count !== "number") return null;
    return b;
  } catch {
    return null;
  }
}

async function writeShared(key: string, b: Bucket): Promise<void> {
  const now = new Date().toISOString();
  const item: ContentItem = {
    id: idOf(key),
    type: "rate",
    title: "限流计数桶",
    tag: "system",
    summary: "",
    body: JSON.stringify(b),
    icon: "",
    tags: [],
    client: "",
    industry: "",
    result: "",
    at: now,
    order: 0,
  };
  try {
    await saveContents([item]);
  } catch {
    // 存储不可用时静默降级：本地内存仍然生效
  }
}

/** 合并共享桶与本地桶，取更严格的一份 */
async function load(key: string): Promise<Bucket> {
  const shared = await readShared(key);
  const own = local.get(key);
  if (!shared) return own ? { ...own } : emptyBucket(Date.now());
  if (!own) return { ...shared };
  return {
    start: Math.min(shared.start, own.start),
    count: Math.max(shared.count, own.count),
    until: Math.max(shared.until, own.until),
  };
}

async function persist(key: string, b: Bucket): Promise<void> {
  local.set(key, { ...b });
  // 必须 await：Serverless/多实例下不等待写完成，计数可能根本没落到共享存储
  await writeShared(key, b);
}

export type RateResult = { ok: boolean; retryAfter: number };

/**
 * 固定窗口计数。命中一次记一次，超过 limit 返回 ok=false。
 * @param key  限流键（建议 `业务:IP`）
 * @param limit 窗口内允许的次数
 * @param windowMs 窗口长度（毫秒）
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateResult> {
  const now = Date.now();
  let b = await load(key);
  if (b.until > now) {
    return { ok: false, retryAfter: Math.ceil((b.until - now) / 1000) };
  }
  if (!b.start || now - b.start >= windowMs) b = emptyBucket(now);
  if (b.count >= limit) {
    const retry = Math.max(1, Math.ceil((b.start + windowMs - now) / 1000));
    return { ok: false, retryAfter: retry };
  }
  b.count += 1;
  await persist(key, b);
  return { ok: true, retryAfter: 0 };
}

/** 登录专用：记录一次失败，达到阈值后锁定一段时间 */
export async function noteFailure(key: string, maxFail: number, lockMs: number): Promise<void> {
  const now = Date.now();
  let b = await load(key);
  if (!b.start || now - b.start >= lockMs) b = emptyBucket(now);
  b.count += 1;
  if (b.count >= maxFail) b.until = now + lockMs;
  await persist(key, b);
}

/** 登录专用：是否处于锁定期，返回剩余秒数（0 表示未锁定） */
export async function lockedFor(key: string): Promise<number> {
  const b = await load(key);
  const left = b.until - Date.now();
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

/** 登录成功后清空失败计数 */
export async function clearFailures(key: string): Promise<void> {
  const b = emptyBucket(Date.now());
  await persist(key, b);
}
