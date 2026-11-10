import type { Metadata } from "next";
import SchedulePublic from "@/components/SchedulePublic";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "智能排课系统",
  description:
    "免费在线排课工具：导入教师名册与旧课表，一键自动排课，支持教师课时上限与冲突校验、三视图核对、拖拽微调，导出课表仅需少量费用。",
  path: "/schedule",
  keywords: ["自动排课", "排课软件", "课程表生成", "学校排课系统"],
});

export default function SchedulePage() {
  return <SchedulePublic />;
}
