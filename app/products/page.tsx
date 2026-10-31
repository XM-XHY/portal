import type { Metadata } from "next";
import Link from "next/link";
import {
  getProductItems,
  getProductDocs,
  countDocsByProduct,
} from "@/lib/products";
import ProductCenter from "@/components/ProductCenter";
import LeadForm from "@/components/LeadForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "产品中心",
  description:
    "产品中心：标准化 AI 产品与成熟解决方案，提供产品资料与方案文档下载，可按业务场景选择并预约演示。",
};

export default async function ProductsPage() {
  const [items, docs] = await Promise.all([getProductItems(), getProductDocs()]);
  const docCount = countDocsByProduct(docs);

  const products = items.filter((i) => i.type === "product").length;
  const solutions = items.filter((i) => i.type === "solution").length;

  return (
    <main className="min-h-screen">
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-[#06080f]/40 to-[#06080f]" />
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="max-w-3xl">
            <span className="glass inline-flex items-center gap-2 px-4 py-1.5 text-sm text-brand-cyan">
              <span className="h-2 w-2 animate-pulse rounded-full bg-brand-cyan" />
              产品中心
            </span>
            <h1 className="mt-6 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              成熟 <span className="text-gradient">产品</span> 与可落地的
              <span className="text-gradient">解决方案</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base text-slate-300 sm:text-lg">
              标准化产品即开即用，解决方案按行业场景整合成熟交付路径。每个条目都配有产品资料与方案文档，可在线阅读或下载。
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-6 text-sm text-slate-400">
              <span>
                <b className="text-white">{products}</b> 个产品
              </span>
              <span>
                <b className="text-white">{solutions}</b> 套解决方案
              </span>
              <span>
                <b className="text-white">{docs.length}</b> 份资料文档
              </span>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="#demo" className="btn-primary">预约演示</Link>
              <Link href="/explore" className="btn-ghost">体验智能获客</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <ProductCenter items={items} docCount={docCount} />
      </section>

      <section id="demo" className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <LeadForm
          title="获取产品资料与方案"
          subtitle="留下联系方式，顾问将在 1 个工作日内与您联系，并发送契合您业务场景的产品资料包。"
        />
      </section>
    </main>
  );
}
