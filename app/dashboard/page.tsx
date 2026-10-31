import type { Metadata } from "next";
import DashboardClient from "@/components/DashboardClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "数据洞察看板 | 智能获客数据分析",
  description: "实时追踪搜索热词、线索来源与转化数据，辅助市场决策与投放优化。",
};

export default function DashboardPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <DashboardClient />
    </main>
  );
}
