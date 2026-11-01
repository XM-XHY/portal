import type { Metadata } from "next";
import SchedulePublic from "@/components/SchedulePublic";

export const metadata: Metadata = {
  title: "智能排课系统",
  description: "免费在线排课：导入名册与旧课表，一键自动排课、三视图校核、拖拽微调，导出课表需支付少量费用。",
};

export default function SchedulePage() {
  return <SchedulePublic />;
}
