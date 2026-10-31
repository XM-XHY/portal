import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getSite } from "@/lib/store";

// 关键：企业信息与内容均由后台 CMS 动态维护（Navbar/Footer/各页面都要实时读取），
// 因此强制动态渲染，避免 Vercel 把站点信息预渲染固化到构建产物中导致后台修改不生效。
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite();
  const name = `${site.companyName}科技`;
  return {
    metadataBase: new URL("https://example.com"),
    title: {
      default: `${name} | ${site.slogan}`,
      template: `%s | ${name}`,
    },
    description: `${name} — 人工智能驱动的数字化解决方案与企业门户。提供全网智能搜索、智能获客与内容管理平台。`,
    keywords: ["人工智能", "企业门户", "AI 获客", "数字化转型", "大模型", name],
    authors: [{ name }],
    openGraph: {
      title: `${name} | ${site.slogan}`,
      description: "人工智能驱动的数字化解决方案与企业门户。",
      type: "website",
      locale: "zh_CN",
    },
    robots: { index: true, follow: true },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const site = await getSite();
  return (
    <html lang="zh-CN">
      <body>
        <Navbar site={site} />
        {children}
        <Footer site={site} />
      </body>
    </html>
  );
}
