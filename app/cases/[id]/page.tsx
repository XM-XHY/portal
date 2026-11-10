import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getContent, getContents } from "@/lib/store";
import { pageMeta } from "@/lib/seo";
import LeadForm from "@/components/LeadForm";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const item = await getContent(params.id);
  if (!item) return { title: "案例详情" };
  return pageMeta({
    title: item.title,
    description: item.summary,
    path: `/cases/${item.id}`,
    keywords: item.tags?.length ? item.tags : item.industry ? [item.industry] : undefined,
    type: "article",
  });
}

export default async function CaseDetail({ params }: { params: { id: string } }) {
  const item = await getContent(params.id);
  if (!item || item.type !== "case") notFound();

  const others = (await getContents("case")).filter((c) => c.id !== item.id).slice(0, 3);

  return (
    <main className="min-h-screen">
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-[#06080f]/40 to-[#06080f]" />
        <div className="relative mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20">
          <Link href="/cases" className="text-sm text-slate-400 hover:text-white">← 返回案例列表</Link>
          <div className="mt-6 flex items-start gap-5">
            <div className="grid h-20 w-20 shrink-0 place-items-center rounded-3xl bg-white/5 text-5xl">
              {item.icon || "🏢"}
            </div>
            <div>
              <div className="inline-flex rounded-full bg-brand-cyan/20 px-3 py-1 text-sm text-brand-cyan">{item.industry || item.tag}</div>
              <h1 className="mt-3 text-3xl font-bold sm:text-4xl">{item.title}</h1>
              {item.client && <p className="mt-2 text-slate-400">客户：{item.client}</p>}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <p className="text-lg leading-relaxed text-slate-200">{item.summary}</p>
          <div className="mt-6 space-y-4 text-slate-300">
            {item.body.split("\n").filter(Boolean).map((line, i) => (
              <p key={i} className="leading-relaxed">{line}</p>
            ))}
          </div>

          {item.tags.length > 0 && (
            <div className="mt-8">
              <h3 className="text-sm font-semibold text-white">应用能力</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {item.tags.map((t) => (
                  <span key={t} className="rounded-full border border-white/15 px-3 py-1 text-sm text-slate-300">{t}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-6">
          {item.result && (
            <div className="glass p-5 text-center">
              <div className="text-3xl font-bold text-gradient">{item.result}</div>
              <div className="mt-1 text-sm text-slate-400">落地成效</div>
            </div>
          )}
          <LeadForm title="咨询同款方案" contextLabel={`咨询方案：${item.title}`} compact />
          {others.length > 0 && (
            <div className="glass p-5">
              <h3 className="text-sm font-semibold text-white">更多案例</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {others.map((c) => (
                  <li key={c.id}>
                    <Link href={`/cases/${c.id}`} className="flex items-center gap-2 text-slate-300 hover:text-white">
                      <span>{c.icon}</span> {c.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
