"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ContentItem } from "@/lib/store";

export default function ProductsExplorer({ products }: { products: ContentItem[] }) {
  const categories = useMemo(() => {
    const set = Array.from(new Set(products.map((p) => p.tag).filter(Boolean)));
    return ["全部", ...set];
  }, [products]);
  const [cat, setCat] = useState("全部");

  const shown = cat === "全部" ? products : products.filter((p) => p.tag === cat);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`rounded-full px-4 py-2 text-sm transition ${
              cat === c
                ? "bg-gradient-to-r from-brand-blue to-brand-violet text-white"
                : "border border-white/15 text-slate-300 hover:bg-white/10"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((p) => (
          <Link
            key={p.id}
            href={`/products/${p.id}`}
            className="glass glass-hover group flex flex-col p-6"
          >
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/5 text-3xl transition group-hover:scale-110">
              {p.icon || "📦"}
            </div>
            <div className="mt-4 inline-flex w-fit rounded-full bg-brand-violet/20 px-2.5 py-0.5 text-xs text-brand-violet">
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
            <div className="mt-4 text-sm font-medium text-brand-blue transition group-hover:translate-x-1">
              查看详情 →
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
