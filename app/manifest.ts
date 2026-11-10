import type { MetadataRoute } from "next";
import { getSite } from "@/lib/store";
import { brandName } from "@/lib/brand";
import { abs } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const site = await getSite();
  const name = brandName(site.companyName);
  return {
    name: `${name} | ${site.slogan}`,
    short_name: name,
    description: `${name} — ${site.slogan}。企业级 AI 产品与解决方案。`,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#06080f",
    theme_color: "#06080f",
    lang: "zh-CN",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
    shortcuts: [{ name: "智能排课", url: abs("/schedule") }],
  };
}
