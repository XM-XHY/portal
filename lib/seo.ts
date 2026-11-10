/**
 * SEO 基础配置。
 *
 * 站点正式域名由环境变量 NEXT_PUBLIC_SITE_URL 指定（Vercel / CloudBase 均需配置），
 * 未配置时回退到生产主域名。注意：metadataBase 若缺失或为 example.com，
 * Next.js 生成的 canonical / Open Graph 链接会是错的，搜索引擎与微信分享都会受影响。
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.cnxhy.top"
).replace(/\/+$/, "");

/** 把站内路径拼成绝对地址（用于 canonical / sitemap / JSON-LD） */
export function abs(path: string = "/"): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** 主站默认关键词（各页面可在自身 metadata 中覆盖） */
export const SITE_KEYWORDS = [
  "人工智能",
  "大模型应用",
  "企业 AI 中台",
  "智能客服",
  "企业知识库",
  "RAG 检索增强",
  "智能获客",
  "私有化部署",
  "数字化转型",
  "AI 解决方案",
];

import type { Metadata } from "next";

/**
 * 页面级 Metadata 快捷构造：统一带上 canonical、Open Graph 与分享图。
 * title 走 layout 的 `%s | 品牌名` 模板，这里只传页面名。
 */
export function pageMeta(opts: {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  noIndex?: boolean;
  type?: "website" | "article";
}): Metadata {
  const url = abs(opts.path);
  const ogImage = { url: abs("/og.jpg"), width: 1200, height: 630 };
  const meta: Metadata = {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: url },
    openGraph: {
      title: opts.title,
      description: opts.description,
      url,
      type: opts.type ?? "website",
      locale: "zh_CN",
      images: [ogImage],
    },
    twitter: { card: "summary_large_image", title: opts.title, description: opts.description },
  };
  if (opts.keywords?.length) meta.keywords = [...SITE_KEYWORDS, ...opts.keywords];
  if (opts.noIndex) meta.robots = { index: false, follow: false };
  return meta;
}
