import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ChatWidget from "@/components/ChatWidget";
import { getSite } from "@/lib/store";
import { brandName } from "@/lib/brand";
import { SITE_URL, SITE_KEYWORDS, abs } from "@/lib/seo";

// 关键：企业信息与内容均由后台 CMS 动态维护（Navbar/Footer/各页面都要实时读取），
// 因此强制动态渲染，避免 Vercel 把站点信息预渲染固化到构建产物中导致后台修改不生效。
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite();
  const name = brandName(site.companyName);
  const title = `${name} | ${site.slogan}`;
  const description =
    `${name}专注于企业级人工智能应用落地，提供智能客服 Copilot、企业知识中枢、` +
    `智能获客中台与 AI 中台整体方案，支持私有化部署，已服务金融、制造、零售等行业客户。`;

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: title,
      template: `%s | ${name}`,
    },
    description,
    keywords: SITE_KEYWORDS,
    authors: [{ name }],
    creator: name,
    publisher: name,
    applicationName: name,
    alternates: { canonical: abs("/") },
    openGraph: {
      type: "website",
      url: SITE_URL,
      siteName: name,
      title,
      description,
      locale: "zh_CN",
      images: [
        {
          url: abs("/og.jpg"),
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [abs("/og.jpg")],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    category: "technology",
    formatDetection: { telephone: false, address: false, email: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 覆盖刘海 / 底部安全区，配合 CSS 的 env(safe-area-inset-*) 使用。
  // 不加 maximumScale / userScalable=no：禁止缩放会伤害可访问性。
  viewportFit: "cover",
  themeColor: "#06080f",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const site = await getSite();
  const name = brandName(site.companyName);

  // 结构化数据：帮助搜索引擎与微信/企微等场景识别站点主体
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": abs("/#organization"),
        name,
        url: SITE_URL,
        slogan: site.slogan,
        description: `${name} — ${site.slogan}`,
        address: {
          "@type": "PostalAddress",
          streetAddress: site.address,
          addressCountry: "CN",
        },
        contactPoint: [
          {
            "@type": "ContactPoint",
            contactType: "sales",
            name: site.contactName,
            telephone: site.phone,
            email: site.email,
          },
        ],
      },
      {
        "@type": "WebSite",
        "@id": abs("/#website"),
        url: SITE_URL,
        name,
        inLanguage: "zh-CN",
        publisher: { "@id": abs("/#organization") },
      },
    ],
  };

  return (
    <html lang="zh-CN">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
        <Link
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-black"
        >
          跳到主要内容
        </Link>
        <Navbar site={site} />
        {/* A-02：skip link 目标必须是 landmark。用 <main> 而非 <div>，
            否则读屏软件无法把「跳到主要内容」识别为主区域导航。 */}
        <main id="main">{children}</main>
        <Footer site={site} />
        <ChatWidget />
      </body>
    </html>
  );
}
