// 产品付费配置：复用 contents 表（type=paycfg），零 DDL。
// 管理员在后台「产品付费」设置收款二维码与每个产品的下载付费金额。
import type { ContentItem, ContentType } from "@/lib/data/types";
import { getContents, saveContents } from "@/lib/store";

export const PAYCFG_TYPE: ContentType = "paycfg";
export const PAYCFG_ID = "paycfg-main";

/** 排课系统等独立产品的付费条目 id（非产品中心条目） */
export const SCHED_PAY_ID = "sched";

export type PayItem = { paid: boolean; amount: number };

export type PayConfig = {
  /** 收款二维码图片（data URL 或外链），公开可见 */
  qrImageUrl: string;
  /** 二维码说明，如「微信/支付宝扫码支付」 */
  qrNote: string;
  /** 各产品/独立工具的下载付费配置：key = 产品 id 或 SCHED_PAY_ID */
  items: Record<string, PayItem>;
};

export function defaultPayConfig(): PayConfig {
  return { qrImageUrl: "", qrNote: "微信 / 支付宝 扫码支付", items: {} };
}

export async function getPayConfig(): Promise<PayConfig> {
  const list = await getContents(PAYCFG_TYPE);
  const item = list.find((x) => x.id === PAYCFG_ID);
  if (!item?.body) return defaultPayConfig();
  try {
    const parsed = JSON.parse(item.body) as Partial<PayConfig>;
    return {
      qrImageUrl: parsed.qrImageUrl || "",
      qrNote: parsed.qrNote || defaultPayConfig().qrNote,
      items: parsed.items || {},
    };
  } catch {
    return defaultPayConfig();
  }
}

export async function savePayConfig(cfg: PayConfig): Promise<void> {
  const list = await getContents();
  const idx = list.findIndex((x) => x.id === PAYCFG_ID && x.type === PAYCFG_TYPE);
  const item: ContentItem = {
    id: PAYCFG_ID,
    type: PAYCFG_TYPE,
    title: "产品付费配置",
    tag: "",
    summary: "",
    body: JSON.stringify(cfg),
    icon: "💰",
    tags: [],
    client: "",
    industry: "",
    result: "",
    at: new Date().toISOString().slice(0, 10),
    order: 1,
  };
  if (idx >= 0) list[idx] = item;
  else list.unshift(item);
  await saveContents(list);
}
