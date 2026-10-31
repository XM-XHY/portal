import Link from "next/link";
import Hero from "@/components/Hero";
import FeatureCards from "@/components/FeatureCards";
import Stats from "@/components/Stats";
import ProductCard from "@/components/ProductCard";
import { getSite, getContents } from "@/lib/store";
import { getProductItems } from "@/lib/products";
import { brandName } from "@/lib/brand";

export default async function HomePage() {
  const [site, products, cases, news] = await Promise.all([
    getSite(),
    getProductItems(), // 产品 + 解决方案，按后台排序
    getContents("case"),
    getContents("news"),
  ]);

  return (
    <main className="min-h-screen">
      <Hero site={site} />
      <FeatureCards />
      <Stats />

      {/* 产品方案 */}
      <section id="products" className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold sm:text-4xl">
              一站式 <span className="text-gradient">AI 能力</span> 矩阵
            </h2>
            <p className="mt-3 max-w-2xl text-slate-400">
              从模型应用到获客转化，把人工智能真正落到业务增长上。
            </p>
          </div>
          <Link href="/products" className="btn-ghost">进入产品中心 →</Link>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {products.slice(0, 4).map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      {/* 客户案例 */}
      <section id="cases" className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold sm:text-4xl">
              被 <span className="text-gradient">行业领先者</span> 选择
            </h2>
            <p className="mt-3 max-w-2xl text-slate-400">
              来自金融、制造、零售等行业的真实落地成效。
            </p>
          </div>
          <Link href="/cases" className="btn-ghost">查看全部案例 →</Link>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-3">
          {cases.slice(0, 3).map((c) => (
            <Link key={c.id} href={`/cases/${c.id}`} className="glass glass-hover group p-6">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-white/5 text-2xl">{c.icon || "🏢"}</div>
              <div className="mt-4 inline-flex w-fit rounded-full bg-brand-cyan/20 px-2.5 py-0.5 text-xs text-brand-cyan">{c.industry || c.tag}</div>
              <h3 className="mt-3 text-lg font-semibold text-white">{c.title}</h3>
              <p className="mt-2 text-sm text-slate-400">{c.summary}</p>
              {c.result && (
                <div className="mt-4 rounded-xl border border-brand-cyan/20 bg-brand-cyan/5 px-3 py-2 text-sm text-brand-cyan">{c.result}</div>
              )}
            </Link>
          ))}
        </div>
      </section>

      {/* 资讯动态（来自后台内容管理） */}
      <section id="news" className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <h2 className="text-3xl font-bold text-center sm:text-4xl">
          <span className="text-gradient">资讯动态</span>
        </h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-3">
          {news.map((n) => (
            <div key={n.id} className="glass glass-hover p-6">
              <div className="text-xs text-slate-500">
                资讯 · {n.tag}
              </div>
              <h3 className="mt-2 font-semibold text-white">{n.title}</h3>
              <p className="mt-2 text-sm text-slate-400">{n.summary}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 联系我们（企业信息联动） */}
      <section id="contact" className="mx-auto max-w-5xl px-4 py-20 sm:px-6">
        <div className="glass p-10 text-center">
          <h2 className="text-3xl font-bold sm:text-4xl">
            与 <span className="text-gradient">{brandName(site.companyName)}</span> 聊聊增长
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-400">
            留下需求，我们的顾问将为你定制 AI 落地方案。
          </p>
          <div className="mt-8 grid gap-4 text-left sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 p-5">
              <div className="text-sm text-slate-400">联系人</div>
              <div className="mt-1 text-lg text-white">{site.contactName}</div>
            </div>
            <div className="rounded-xl border border-white/10 p-5">
              <div className="text-sm text-slate-400">联系电话</div>
              <div className="mt-1 text-lg text-white">{site.phone}</div>
            </div>
            <div className="rounded-xl border border-white/10 p-5">
              <div className="text-sm text-slate-400">邮箱</div>
              <div className="mt-1 text-lg text-white">{site.email}</div>
            </div>
            <div className="rounded-xl border border-white/10 p-5">
              <div className="text-sm text-slate-400">公司地址</div>
              <div className="mt-1 text-lg text-white">{site.address}</div>
            </div>
          </div>
          <Link href="/explore" className="btn-primary mt-8">
            开始智能获客
          </Link>
        </div>
      </section>
    </main>
  );
}
