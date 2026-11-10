import type { Metadata } from "next";
import DashboardClient from "@/components/DashboardClient";
import HubLogin from "@/components/HubLogin";
import { pageMeta } from "@/lib/seo";
import { getAdminFromCookie } from "@/lib/session";
import { can } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMeta({
  title: "数据洞察看板",
  description: "实时追踪搜索热词、线索来源与转化数据，辅助市场决策与投放优化。",
  path: "/dashboard",
  noIndex: true,
});

/**
 * 数据看板含线索来源、公司名称与最近线索明细，属经营数据：
 * 服务端先校验会话与权限，未登录直接渲染登录卡片，避免公开泄露。
 * 与之配套的 /api/analytics 同样要求登录 + search.logs 权限。
 */
export default async function DashboardPage() {
  const admin = await getAdminFromCookie();

  if (!admin) {
    return (
      <HubLogin
        title="数据洞察看板"
        subtitle="搜索热词 · 线索来源 · 转化趋势"
        icon="📊"
        accountPlaceholder="后台账号"
        note="数据看板仅对已登录且具备「获客日志」权限的账号开放；账号由超级管理员在后台开通。"
      />
    );
  }

  if (!can(admin.role, "search.logs")) {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <div className="glass w-full max-w-md p-8 text-center">
          <h1 className="text-xl font-semibold text-white">暂无访问权限</h1>
          <p className="mt-3 text-sm text-slate-400">
            当前账号（{admin.username}）不具备「获客日志」权限，无法查看数据看板。请联系超级管理员调整角色。
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <DashboardClient />
    </main>
  );
}
