import type { Metadata } from "next";
import Link from "next/link";
import { getSite } from "@/lib/store";
import { brandName } from "@/lib/brand";
import { pageMeta } from "@/lib/seo";
import Stats from "@/components/Stats";
import LeadForm from "@/components/LeadForm";

export const metadata: Metadata = pageMeta({
  title: "关于我们",
  description:
    "用 AI 重塑企业增长。我们专注于企业级大模型应用落地，把人工智能做可信、可用、可规模化，让每一家企业都能真正用上 AI。",
  path: "/about",
  keywords: ["公司介绍", "AI 团队", "企业愿景"],
});

const VALUES = [
  { icon: "🎯", title: "客户为先", desc: "以业务增长为标尺，不做炫技的 AI，只做能落地的 AI。" },
  { icon: "🔍", title: "可信可用", desc: "结果可溯源、数据可合规，让企业放心把核心场景交给 AI。" },
  { icon: "⚡", title: "敏捷交付", desc: "以周为单位迭代，快速验证价值，再规模化复制。" },
  { icon: "🤝", title: "长期陪伴", desc: "从试点到规模化，与客户共同成长，而非一锤子买卖。" },
];

const MILESTONES = [
  { year: "2021", title: "公司成立", desc: "核心团队来自头部 AI 实验室与云厂商，专注企业级大模型应用。" },
  { year: "2022", title: "首款产品上线", desc: "智能客服 Copilot 发布，服务首批金融与制造业客户。" },
  { year: "2024", title: "智能获客中台", desc: "推出全网检索 + LLM 摘要的获客引擎，线索转化显著提速。" },
  { year: "2026", title: "AI 企业门户", desc: "发布集内容、获客、权限于一体的企业门户，服务客户突破 300+。" },
];

export default async function AboutPage() {
  const site = await getSite();

  return (
    <main className="min-h-screen">
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-[#06080f]/40 to-[#06080f]" />
        <div className="relative mx-auto max-w-5xl px-4 py-20 text-center sm:px-6 sm:py-28">
          <span className="glass inline-flex items-center gap-2 px-4 py-1.5 text-sm text-brand-cyan">
            <span className="h-2 w-2 animate-pulse rounded-full bg-brand-cyan" />
            关于 {brandName(site.companyName)}
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            让每一家企业，<br className="hidden sm:block" />都能用上 <span className="text-gradient">可信的 AI</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-slate-300 sm:text-lg">
            {site.slogan}。我们专注于把人工智能从概念落到业务实处，陪伴企业穿越数字化与智能化的每一次跃迁。
          </p>
        </div>
      </section>

      <Stats />

      {/* 使命与价值观 */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-3xl font-bold sm:text-4xl">我们的 <span className="text-gradient">价值观</span></h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {VALUES.map((v) => (
            <div key={v.title} className="glass glass-hover p-6">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-white/5 text-2xl">{v.icon}</div>
              <h3 className="mt-4 text-lg font-semibold text-white">{v.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{v.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 发展历程 */}
      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-3xl font-bold sm:text-4xl">发展 <span className="text-gradient">历程</span></h2>
        <div className="relative mt-10 pl-6">
          <div className="absolute left-2 top-2 h-full w-px bg-gradient-to-b from-brand-cyan via-brand-blue to-brand-violet" />
          <div className="space-y-8">
            {MILESTONES.map((m) => (
              <div key={m.year} className="relative">
                <span className="absolute -left-[1.4rem] top-1 h-4 w-4 rounded-full border-2 border-brand-cyan bg-[#06080f]" />
                <div className="glass p-5">
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-bold text-gradient">{m.year}</span>
                    <span className="text-lg font-semibold text-white">{m.title}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-400">{m.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 联系我们 */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <div className="glass p-10">
          <h2 className="text-center text-3xl font-bold sm:text-4xl">
            与 <span className="text-gradient">{brandName(site.companyName)}</span> 聊聊增长
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-slate-400">
            无论你是想试点一个 AI 场景，还是规划企业级智能化蓝图，我们都期待与你对话。
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
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <LeadForm title="给我们留言" subtitle="填写下方表单，顾问会尽快与您联系。" />
            <div className="glass flex flex-col items-center justify-center p-8 text-center">
              <div className="text-4xl">💡</div>
              <p className="mt-3 text-slate-300">想直接体验能力？</p>
              <Link href="/explore" className="btn-primary mt-4">前往智能获客</Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
