import type { Metadata } from "next";
import { getAdminFromCookie } from "@/lib/session";
import HubLogin from "@/components/HubLogin";
import HubPortal from "@/components/HubPortal";
import { pageMeta } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMeta({
  title: "企业知识中枢",
  description: "员工登录后可检索企业知识库材料，并通过对话基于知识库一键生成可下载的材料文档。",
  path: "/hub",
  noIndex: true,
});

export default async function HubPage() {
  const user = await getAdminFromCookie();
  if (!user) return <HubLogin />;
  return <HubPortal username={user.username} role={user.role} />;
}
