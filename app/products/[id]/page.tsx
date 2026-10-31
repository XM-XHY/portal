import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getContent, getContents } from "@/lib/store";
import LeadForm from "@/components/LeadForm";
import OpenChatButton from "@/components/OpenChatButton";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const item = await getContent(params.id);
  if (!item) return { title: "产品详情" };
  return { title: item.title, description: item.summary };
}

export default async function ProductDetail({ params }: { params: { id: string } }) {
  const item = await getContent(params.id);
  if (!item || item.type !== "product") notFound();

  const others = (await getContents("product")).filter((p) => p.id !== item.id).slice(0, 3);

  return (
    <main className="min-h-screen">
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-[#06080f]/40 to-[#06080f]" />
        <div className="relative mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20">
          <Link href="/products" className="text-sm text-slate-400 hover:text-white">← 返回产品列表</Link>
          <div className="mt-6 flex items-start gap-5">
            <div className="grid h-20 w-20 shrink-0 place-items-center rounded-3xl bg-white/5 text-5xl">
              {item.icon || "📦"}
            </div>
            <div>
              <div className="inline-flex rounded-full bg-brand-violet/20 px-3 py-1 text-sm text-brand-violet">{item.tag}</div>
              <h1 className="mt-3 text-3xl font-bold sm:text-4xl">{item.title}</h1>
              {item.result && <p className="mt-2 text-brand-cyan">成效：{item.result}</p>}
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
              <h3 className="text-sm font-semibold text-white">核心能力</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {item.tags.map((t) => (
                  <span key={t} className="rounded-full border border-white/15 px-3 py-1 text-sm text-slate-300">{t}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-6">
          {(item.title.includes("客服") || /copilot/i.test(item.title)) && (
            <OpenChatButton label="💬 在线体验 AI 客服" />
          )}
          {item.title.includes("获客") && (
            <Link href="/explore" className="btn-primary block w-full text-center">
              🚀 进入获客工作台
            </Link>
          )}
          <LeadForm title="预约此方案演示" contextLabel={`预约演示：${item.title}`} compact />
          {others.length > 0 && (
            <div className="glass p-5">
              <h3 className="text-sm font-semibold text-white">相关产品</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {others.map((p) => (
                  <li key={p.id}>
                    <Link href={`/products/${p.id}`} className="flex items-center gap-2 text-slate-300 hover:text-white">
                      <span>{p.icon}</span> {p.title}
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
