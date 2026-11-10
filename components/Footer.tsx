"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SiteInfo } from "@/lib/store";
import { brandName } from "@/lib/brand";

export default function Footer({ site }: { site: SiteInfo }) {
  const pathname = usePathname();
  // 全屏体验页不渲染页脚：iframe 应该独占视口，避免双重滚动
  if (pathname?.startsWith("/works/")) return null;

  return (
    <footer className="border-t border-white/10 bg-[#06080f]/60">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-5 gap-y-8 px-4 py-10 sm:px-6 md:grid-cols-4 md:gap-8 md:py-12">
        <div className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-2 font-semibold">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-blue to-brand-violet text-white">
              AI
            </span>
            {brandName(site.companyName)}
          </div>
          <p className="mt-3 text-sm text-slate-400">{site.slogan}</p>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white">产品</h4>
          <ul className="mt-3 space-y-2 text-sm text-slate-400">
            <li><Link href="/products" className="hover:text-white">产品与方案</Link></li>
            <li><Link href="/explore" className="hover:text-white">智能获客</Link></li>
            <li><Link href="/schedule" className="hover:text-white">智能排课</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white">公司</h4>
          <ul className="mt-3 space-y-2 text-sm text-slate-400">
            <li><Link href="/cases" className="hover:text-white">客户案例</Link></li>
            <li><Link href="/about" className="hover:text-white">关于我们</Link></li>
            <li><Link href="/admin" className="hover:text-white">后台管理</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white">联系</h4>
          <ul className="mt-3 space-y-2 text-sm text-slate-400">
            <li>联系人：{site.contactName}</li>
            <li>电话：{site.phone}</li>
            <li>邮箱：{site.email}</li>
            <li>地址：{site.address}</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-5 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} {brandName(site.companyName)} 版权所有 ·{" "}
        {site.icp ? (
          <a
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="hover:text-slate-300"
          >
            {site.icp}
          </a>
        ) : null}
      </div>
    </footer>
  );
}
