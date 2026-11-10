import type { MetadataRoute } from "next";
import { getContents } from "@/lib/store";
import { abs } from "@/lib/seo";

// 产品/案例由后台 CMS 维护，因此站点地图按请求实时生成，
// 避免构建期固化导致后台新增内容不出现在 sitemap 中。
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const items = await getContents();
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: abs("/"), lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: abs("/products"), lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: abs("/works"), lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: abs("/schedule"), lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: abs("/balance"), lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: abs("/cases"), lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: abs("/about"), lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: abs("/explore"), lastModified: now, changeFrequency: "weekly", priority: 0.7 },
  ];

  const dynamicRoutes: MetadataRoute.Sitemap = items
    .filter((i) => i.type === "product" || i.type === "solution" || i.type === "case")
    .map((i) => ({
      url: abs(i.type === "case" ? `/cases/${i.id}` : `/products/${i.id}`),
      lastModified: i.at ? new Date(i.at) : now,
      changeFrequency: "monthly" as const,
      priority: i.type === "case" ? 0.6 : 0.8,
    }));

  return [...staticRoutes, ...dynamicRoutes];
}
