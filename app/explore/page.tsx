import { Suspense } from "react";
import type { Metadata } from "next";
import ExploreClient from "@/components/ExploreClient";

export const metadata: Metadata = {
  title: "智能获客 · 全网检索",
  description: "输入关键词，全网智能检索可信信息，并一键留下联系方式获取定制方案。",
};

export default function ExplorePage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-slate-400">加载中…</div>}>
      <ExploreClient />
    </Suspense>
  );
}
