"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ContentItem } from "@/lib/store";

export default function CasesExplorer({ cases }: { cases: ContentItem[] }) {
  const industries = useMemo(() => {
    const set = Array.from(new Set(cases.map((c) => c.industry).filter(Boolean)));
    return ["全部", ...set];
  }, [cases]);
  const [ind, setInd] = useState("全部");

  const shown = ind === "全部" ? cases : cases.filter((c) => c.industry === ind);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {industries.map((c) => (
          <button
            key={c}
            onClick={() => setInd(c)}
            className={`rounded-full px-4 py-2 text-sm transition ${
              ind === c
                ? "bg-gradient-to-r from-brand-blue to-brand-violet text-white"
                : "border border-white/15 text-slate-300 hover:bg-white/10"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((c) => (
          <Link
            key={c.id}
            href={`/cases/${c.id}`}
            className="glass glass-hover group flex flex-col p-6"
          >
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/5 text-3xl transition group-hover:scale-110">
              {c.icon || "🏢"}
            </div>
            <div className="mt-4 inline-flex w-fit rounded-full bg-brand-cyan/20 px-2.5 py-0.5 text-xs text-brand-cyan">
              {c.industry || c.tag}
            </div>
            <h3 className="mt-3 text-lg font-semibold text-white">{c.title}</h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-400">{c.summary}</p>
            {c.result && (
              <div className="mt-4 rounded-xl border border-brand-cyan/20 bg-brand-cyan/5 px-3 py-2 text-sm text-brand-cyan">
                {c.result}
              </div>
            )}
            <div className="mt-4 text-sm font-medium text-brand-blue transition group-hover:translate-x-1">
              查看案例 →
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
