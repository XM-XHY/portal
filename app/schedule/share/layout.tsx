import type { Metadata } from "next";

// 课表分享链接含访问凭据，禁止搜索引擎收录
export const metadata: Metadata = {
  title: "课表分享",
  robots: { index: false, follow: false },
};

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
