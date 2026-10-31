import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getContent, getContents } from "@/lib/store";
import { getProductDocs, docsOfProduct, docIcon, KIND_LABEL } from "@/lib/products";
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
  if (!item || (item.type !== "product" && item.type !== "solution")) notFound();

  const kindKey = item.type === "solution" ? "solution" : "product";
  const [docs, all] = await Promise.all([getProductDocs(), getContents("product")]);
  const myDocs = docsOfProduct(docs, item.id);
  const others = all.filter((p) => p.id !== item.id).slice(0, 3);

  return (
    <main className="min-h-screen">
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-[#06080f]/40 to-[#06080f]" />
        <div className="relative mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20">
          <Link href="/products" className="text-sm text-slate-400 hover:text-white">← 返回产品中心</Link>
          <div className="mt-6 flex items-start gap-5">
            <div className="grid h-20 w-20 shrink-0 place-items-center rounded-3xl bg-white/5 text-5xl">
              {item.icon || "📦"}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-sm ${
                    kindKey === "solution"
                      ? "bg-brand-cyan/20 text-brand-cyan"
                      : "bg-brand-violet/20 text-brand-violet"
                  }`}
                >
                  {KIND_LABEL[kindKey]}
                </span>
                <span className="inline-flex rounded-full bg-white/10 px-3 py-1 text-sm text-slate-300">
                  {item.tag}
                </span>
              </div>
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

          {item.industry && (
            <div className="mt-8 rounded-2xl border border-white/10 p-5">
              <h3 className="text-sm font-semibold text-white">适用场景</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{item.industry}</p>
            </div>
          )}

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

          {/* 产品资料 / 方案文档（后台导入） */}
          <div className="mt-10">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-white">
                产品资料与方案文档{myDocs.length > 0 ? `（${myDocs.length}）` : ""}
              </h3>
            </div>
            {myDocs.length === 0 ? (
              <p className="mt-3 rounded-2xl border border-white/10 p-5 text-sm text-slate-400">
                暂无资料文档。需要完整资料包可在右侧留下联系方式，顾问会第一时间发送。
              </p>
            ) : (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {myDocs.map((d) => (
                  <li key={d.id} className="rounded-2xl border border-white/10 p-4">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{docIcon(d.tag)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-slate-100" title={d.title}>
                          {d.title}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {d.tag.toUpperCase()} · {d.result} 字 · {d.at}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <a
                        href={`/api/products/doc/${d.id}?mode=view`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10"
                      >
                        在线阅读
                      </a>
                      <a
                        href={`/api/products/doc/${d.id}`}
                        className="rounded-lg border border-brand-cyan/40 px-3 py-1.5 text-xs text-brand-cyan transition hover:bg-brand-cyan/10"
                      >
                        下载文本版
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-slate-500">
              资料由后台导入原始文档（Word/Excel/PDF/TXT/MD）后自动提取，下载为文本版；如需原始文件请联系顾问。
            </p>
          </div>
        </div>

        <aside className="space-y-6">
          {/客服|copilot/i.test(item.title) && (
            <OpenChatButton label="💬 在线体验 AI 客服" />
          )}
          {/知识中枢|知识管理/.test(item.title) && (
            <Link href="/hub" className="btn-primary block w-full text-center">
              📚 进入企业知识中枢
            </Link>
          )}
          {item.title.includes("获客") && (
            <Link href="/explore" className="btn-primary block w-full text-center">
              🚀 进入获客工作台
            </Link>
          )}
          <LeadForm title="获取该方案资料" contextLabel={`索取资料：${item.title}`} compact />
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
              <Link href="/products" className="mt-3 block text-xs text-brand-cyan hover:underline">
                查看全部产品与解决方案 →
              </Link>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
