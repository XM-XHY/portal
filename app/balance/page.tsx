import type { Metadata } from "next";
import BalancePublic from "@/components/BalancePublic";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "均衡分班系统",
  description:
    "免费在线均衡分班：导入学生名册，按成绩、男女、村居（同村可选同班或打散）、双胞胎捆绑等条件一键均衡分班，支持指定学生锁定班级与手动微调，分班后可发布家长扫码查询，导出分班名单仅需少量费用。",
  path: "/balance",
  keywords: ["均衡分班", "分班软件", "学生分班系统", "阳光分班", "分班工具"],
});

export default function BalancePage() {
  return <BalancePublic />;
}
