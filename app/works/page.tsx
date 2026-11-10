import type { Metadata } from "next";
import Link from "next/link";
import { pageMeta } from "@/lib/seo";
import { WORKS } from "@/lib/works";

export const metadata: Metadata = pageMeta({
  title: "作品中心",
  description:
    "数字员工制作空间的作品展示与在线体验：全科提分导师覆盖 9 大学科小学到高中全学段，支持成绩录入、薄弱点定位、分层出题、作业批改与学情周报。",
  path: "/works",
  keywords: ["数字员工", "AI 教育应用", "全科提分", "作品展示"],
});

export default function WorksPage() {
  return (
    <main className="min-h-[100dvh]">
      {/* 顶部主视觉：窄屏压缩上下留白，避免第一屏只看到标题 */}
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-[#06080f]/40 to-[#06080f]" />
        <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-20 lg:py-28">
          <div className="max-w-3xl">
            <span className="glass inline-flex items-center gap-2 px-3 py-1.5 text-xs text-brand-cyan sm:px-4 sm:text-sm">
              <span className="h-2 w-2 animate-pulse rounded-full bg-brand-cyan" />
              作品中心
            </span>
            <h1 className="mt-5 text-[1.75rem] font-bold leading-tight tracking-tight sm:mt-6 sm:text-4xl lg:text-5xl">
              已经跑起来的 <span className="text-gradient">数字员工</span>
            </h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-slate-300 sm:mt-5 sm:text-base lg:text-lg">
              这里放的不是效果图，是能直接点开就用的成品。每个作品都支持在线体验，
              手机与电脑同一套代码，注册后学习数据保存在本站，换设备登录自动同步。
            </p>
            <div className="mt-7 grid grid-cols-2 gap-2.5 sm:mt-8 sm:flex sm:flex-wrap sm:gap-3">
              <Link
                href="/works/quanke"
                className="btn-primary w-full justify-center sm:w-auto"
              >
                立即体验
              </Link>
              <Link href="#works" className="btn-ghost w-full justify-center sm:w-auto">
                查看作品
              </Link>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-slate-500 sm:text-sm">
              手机端体验页支持全屏，输入、拍照、表格都已做触控适配。
            </p>
          </div>
        </div>
      </section>

      {/* 作品列表 */}
      <section id="works" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-10 sm:px-6 sm:py-16">
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl lg:text-3xl">作品列表</h2>
        <p className="mt-2 text-sm text-slate-400 sm:mt-3">
          当前共 {WORKS.length} 件作品，持续更新中。点击卡片上的「立即体验」即可在站内直接试用。
        </p>

        <div className="mt-6 grid gap-4 sm:mt-10 sm:gap-6 lg:grid-cols-2">
          {WORKS.map((w) => (
            <article key={w.id} className="glass glass-hover flex flex-col p-5 sm:p-8">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className="rounded-full border border-brand-cyan/40 bg-brand-cyan/10 px-2.5 py-1 text-[11px] text-brand-cyan sm:px-3 sm:text-xs">
                  在线可体验
                </span>
                {w.tags.slice(0, 3).map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300 sm:px-3 sm:text-xs"
                  >
                    {t}
                  </span>
                ))}
              </div>

              <h3 className="mt-4 text-xl font-semibold tracking-tight sm:mt-5 sm:text-2xl">
                {w.name}
              </h3>
              <p className="mt-1 text-[13px] text-brand-cyan sm:text-sm">{w.subtitle}</p>
              <p className="mt-3 text-sm leading-relaxed text-slate-300 sm:mt-4">{w.summary}</p>

              <ul className="mt-4 flex flex-wrap gap-1.5 sm:mt-6 sm:gap-2">
                {w.coverage.map((c) => (
                  <li
                    key={c}
                    className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-slate-300 sm:px-3 sm:text-xs"
                  >
                    {c}
                  </li>
                ))}
              </ul>

              <div className="mt-6 flex flex-col items-stretch gap-2 sm:mt-8 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
                <Link
                  href={`/works/${w.id}`}
                  className="btn-primary w-full justify-center px-5 py-2.5 text-sm sm:w-auto"
                >
                  立即体验
                </Link>
                <span className="text-xs text-slate-500">更新于 {w.updatedAt}</span>
              </div>
            </article>
          ))}

          {/* 占位卡：说明后续还会上更多作品，避免只有一张卡显得单薄 */}
          <div className="glass flex flex-col justify-center p-5 text-slate-400 sm:p-8">
            <p className="text-base font-medium text-slate-300 sm:text-lg">更多作品准备中</p>
            <p className="mt-3 text-sm leading-relaxed">
              数字员工制作空间里还有 9 个单科版本（数学 / 语文 / 英语 / 物理 / 化学 /
              生物 / 地理 / 历史 / 道法）正在逐步上线，也会陆续接入企业侧的客服与知识库数字员工。
            </p>
            <p className="mt-3 text-sm leading-relaxed">
              有想先看到的科目或场景，欢迎
              <Link href="/about#contact" className="mx-1 text-brand-cyan hover:underline">
                联系我们
              </Link>
              提需求。
            </p>
          </div>
        </div>
      </section>

      {/* 能力亮点：取第一件作品的功能清单 */}
      <section id="highlights" className="mx-auto max-w-7xl scroll-mt-20 px-4 pb-10 sm:px-6 sm:pb-16">
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl lg:text-3xl">
          {WORKS[0]?.name} 能做什么
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-400 sm:mt-3">
          七大功能覆盖「测—教—练—评」全流程，不需要装 App，打开网页就能用。
        </p>

        <div className="mt-6 grid gap-3 sm:mt-10 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {(WORKS[0]?.highlights ?? []).map((h, i) => (
            <div key={h.title} className="glass glass-hover p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand-blue to-brand-violet text-sm font-semibold text-white">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="text-sm font-medium text-slate-100 sm:text-base">{h.title}</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">{h.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 体验说明与转化 */}
      <section className="mx-auto max-w-3xl px-4 pb-16 sm:px-6 sm:pb-24">
        <div className="glass p-5 sm:p-8">
          <h2 className="text-base font-semibold sm:text-lg">体验前你需要知道</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            {WORKS[0]?.accessNote}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            拍照识别首次使用需要联网加载识别引擎，加载完成后会缓存到本地，之后响应更快。
          </p>
          <div className="mt-6 grid grid-cols-1 gap-2.5 sm:flex sm:flex-wrap sm:gap-3">
            <Link href="/works/quanke" className="btn-primary w-full justify-center sm:w-auto">
              去体验全科提分导师
            </Link>
            <Link href="/about#contact" className="btn-ghost w-full justify-center sm:w-auto">
              咨询定制数字员工
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
