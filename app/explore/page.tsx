import { Suspense } from "react";
import type { Metadata } from "next";
import ExploreClient from "@/components/ExploreClient";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "智能获客 · 全网检索",
  description:
    "输入关键词即可全网智能检索权威信息，AI 自动生成带引用的摘要，并支持一键留下联系方式获取定制方案。",
  path: "/explore",
  keywords: ["全网检索", "智能搜索", "AI 获客"],
});

export default function ExplorePage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-slate-400">加载中…</div>}>
      <ExploreClient />
    </Suspense>
  );
}
