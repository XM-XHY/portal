/**
 * 产品中心服务端读取助手（产品 / 解决方案 + 挂在条目下的产品资料 pdoc）。
 * 写操作统一走 /api/products/* 路由（需后台登录与内容权限）。
 */
import { getContents } from "./store";
import type { ContentItem } from "./data/types";
import { PDOC_TYPE } from "./product-meta";

export * from "./product-meta";

/** 产品 + 解决方案，按后台设定的 order 升序 */
export async function getProductItems(): Promise<ContentItem[]> {
  const [products, solutions] = await Promise.all([
    getContents("product"),
    getContents("solution"),
  ]);
  return [...products, ...solutions].sort((a, b) => a.order - b.order);
}

/** 全部产品资料（pdoc），调用方再按 client（所属条目 id）分组 */
export async function getProductDocs(): Promise<ContentItem[]> {
  return getContents(PDOC_TYPE);
}

export function docsOfProduct<T extends { client: string }>(
  docs: T[],
  productId: string
): T[] {
  return docs.filter((d) => d.client === productId);
}

export function countDocsByProduct(docs: { client: string }[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const d of docs) {
    if (!d.client) continue;
    map[d.client] = (map[d.client] || 0) + 1;
  }
  return map;
}
