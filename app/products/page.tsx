import type { Metadata } from "next";
import Link from "next/link";
import { getContents } from "@/lib/store";
import ProductsExplorer from "@/components/ProductsExplorer";
import LeadForm from "@/components/LeadForm";

export const metadata: Metadata = {
  title: "产品与解决方案",
  description: "XX 科技 AI 产品矩阵：智能客服、企业知识中枢、智能获客中台与数据洞察看板，覆盖企业增长全链路。",
};

export default async function ProductsPage() {
  const products = await getContents("product");

  return (
    <main className="min-h-screen">
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-[#06080f]/40 to-[#06080f]" />
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="max-w-3xl">
            <span className="glass inline-flex items-center gap-2 px-4 py-1.5 text-sm text-brand-cyan">
              <span className="h-2 w-2 animate-pulse rounded-full bg-brand-cyan" />
              产品与解决方案
            </span>
            <h1 className="mt-6 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              一站式 <span className="text-gradient">AI 能力</span> 矩阵
            </h1>
            <p className="mt-5 max-w-2xl text-base text-slate-300 sm:text-lg">
              从模型应用到获客转化，我们把人工智能真正落到业务增长上。选择适合你的方案，或预约一次专属演示。
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="#demo" className="btn-primary">预约演示</Link>
              <Link href="/explore" className="btn-ghost">体验智能获客</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <ProductsExplorer products={products} />
      </section>

      <section id="demo" className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <LeadForm
          title="预约产品演示"
          subtitle="留下联系方式，顾问将在 1 个工作日内与您联系，演示契合您业务场景的 AI 方案。"
        />
      </section>
    </main>
  );
}
