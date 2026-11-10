// 教师工作台在线版入口：静态页位于 public/teacher/index.html
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default function TeacherWorkbenchEntry() {
  redirect("/teacher/index.html");
}
