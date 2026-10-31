"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ContentItem } from "@/lib/store";
import { KIND_LABEL } from "@/lib/product-meta";

type KindFilter = "all" | "product" | "solution";

const KIND_TABS: { key: KindFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "product", label: "产品" },
  { key: "solution", label: "解决方案" },
];

/**
 * 产品中心：产品 / 解决方案 切换 + 分类筛选 + 卡片列表。
 * 展示顺序由后台「产品中心」拖拽排序决定（服务端已按 order 升序传入）。
 */
export default function ProductCenter({
  items,
  docCount,
}: {
  items: ContentItem[];
  docCount: Record<string, number>;
}) {
  const [kind, setKind] = useState<KindFilter>("all");
  const [cat, setCat] = useState("全部");

  const byKind = useMemo(
    () => (kind === "all" ? items : items.filter((i) => i.type === kind)),
    [items, kind]
  );

  const categories = useMemo(
    () => ["全部", ...Array.from(new Set(byKind.map((i) => i.tag).filter(Boolean)))],
    [byKind]
  );

  const shown = useMemo(
    () => (cat === "全部" ? byKind : byKind.filter((i) => i.tag === cat)),
    [byKind, cat]
  );

  function switchKind(k: KindFilter) {
    setKind(k);
    setCat("全部"); // 切换类型后原分类可能不存在，回到全部
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {KIND_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => switchKind(t.key)}
            className={`rounded-full px-5 py-2 text-sm font-medium transition ${
              kind === t.key
                ? "bg-gradient-to-r from-brand-blue to-brand-violet text-white"
                : "border border-white/15 text-slate-300 hover:bg-white/10"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {categories.length > 2 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`rounded-full px-3 py-1.5 text-xs transition ${
                cat === c
                  ? "bg-white/20 text-white"
                  : "border border-white/10 text-slate-400 hover:bg-white/10"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-white/10 p-8 text-center text-slate-400">
          该分类下暂无内容，可在后台「产品中心」添加产品与解决方案。
        </p>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => {
            const docs = docCount[p.id] || 0;
            const kindKey: "product" | "solution" = p.type === "solution" ? "solution" : "product";
            return (
              <Link
                key={p.id}
                href={`/products/${p.id}`}
                className="glass glass-hover group relative flex flex-col p-6"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/5 text-3xl transition group-hover:scale-110">
                    {p.icon || "📦"}
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs ${
                      kindKey === "solution"
                        ? "bg-brand-cyan/20 text-brand-cyan"
                        : "bg-brand-violet/20 text-brand-violet"
                    }`}
                  >
                    {KIND_LABEL[kindKey]}
                  </span>
                </div>

                <div className="mt-4 inline-flex w-fit rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-slate-300">
                  {p.tag}
                </div>
                <h3 className="mt-3 text-lg font-semibold text-white">{p.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-400">{p.summary}</p>

                {p.result && (
                  <div className="mt-4 inline-flex items-center gap-2 text-sm text-brand-cyan">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-cyan" />
                    {p.result}
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
                  <span className="text-xs text-slate-500">
                    {docs > 0 ? `📎 ${docs} 份资料` : "暂无资料"}
                  </span>
                  <span className="text-sm font-medium text-brand-blue transition group-hover:translate-x-1">
                    查看详情 →
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-xs text-slate-500">
        资料支持 Word / Excel / PDF / TXT / Markdown，由后台导入后可在详情页在线阅读或下载。
      </p>
    </div>
  );
}
