"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const hotKeywords = ["大模型选型", "AI 客服方案", "企业知识库", "智能获客", "数据合规"];

export default function SearchWidget() {
  const router = useRouter();
  const [q, setQ] = useState("");

  function submit(value: string) {
    const kw = value.trim();
    if (!kw) return;
    router.push(`/explore?q=${encodeURIComponent(kw)}`);
  }

  return (
    <div className="w-full max-w-2xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(q);
        }}
        className="glass flex flex-col gap-2 p-2 sm:flex-row sm:items-center"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="pl-3 text-brand-cyan" aria-hidden>
            🔍
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            type="search"
            inputMode="search"
            placeholder="输入关键词，全网智能检索"
            aria-label="全网智能搜索关键词"
            className="min-w-0 flex-1 bg-transparent px-2 py-3 text-base text-slate-100 placeholder:text-slate-500 outline-none"
          />
        </div>
        <button type="submit" className="btn-primary w-full shrink-0 sm:w-auto">
          智能搜索
        </button>
      </form>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-400 sm:gap-2 sm:text-sm">
        <span>热门：</span>
        {hotKeywords.map((k) => (
          <button
            key={k}
            onClick={() => submit(k)}
            className="min-h-[36px] rounded-full border border-white/10 px-3 py-1.5 transition hover:border-brand-cyan/50 hover:text-white"
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}
