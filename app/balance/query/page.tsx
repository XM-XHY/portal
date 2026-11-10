import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import BalanceQueryClient from "./QueryClient";

export const metadata: Metadata = pageMeta({
  title: "分班结果查询",
  description: "输入查询码与学生姓名，查询均衡分班结果。",
  path: "/balance/query",
  noIndex: true,
});

export default function BalanceQueryPage() {
  return <BalanceQueryClient />;
}
