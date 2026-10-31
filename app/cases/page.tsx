import type { Metadata } from "next";
import Link from "next/link";
import { getContents } from "@/lib/store";
import CasesExplorer from "@/components/CasesExplorer";
import LeadForm from "@/components/LeadForm";

export const metadata: Metadata = {
  title: "客户案例",
  description: "XX 科技已服务金融、制造、零售等多个行业的领先企业，用 AI 带来可量化的业务增长。",
};

export default async function CasesPage() {
  const cases = await getContents("case");

  return (
    <main className="min-h-screen">
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-[#06080f]/40 to-[#06080f]" />
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="max-w-3xl">
            <span className="glass inline-flex items-center gap-2 px-4 py-1.5 text-sm text-brand-cyan">
              <span className="h-2 w-2 animate-pulse rounded-full bg-brand-cyan" />
              客户案例
            </span>
            <h1 className="mt-6 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              被 <span className="text-gradient">行业领先者</span> 选择
            </h1>
            <p className="mt-5 max-w-2xl text-base text-slate-300 sm:text-lg">
              从金融到制造、从零售到政企，我们用可量化的 AI 成效，陪伴客户穿越增长瓶颈。
            </p>
            <div className="mt-8">
              <Link href="#contact" className="btn-primary">获取同款方案</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <CasesExplorer cases={cases} />
      </section>

      <section id="contact" className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <LeadForm
          title="获取同款方案"
          subtitle="告诉我们您的行业与痛点，我们将为您匹配最契合的落地案例与实施方案。"
        />
      </section>
    </main>
  );
}
