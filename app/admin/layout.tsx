import type { Metadata } from "next";

// 管理后台是内部页面，禁止搜索引擎收录
export const metadata: Metadata = {
  title: "管理后台",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
