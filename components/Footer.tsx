import Link from "next/link";
import type { SiteInfo } from "@/lib/store";

export default function Footer({ site }: { site: SiteInfo }) {
  return (
    <footer className="border-t border-white/10 bg-[#06080f]/60">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2 font-semibold">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-blue to-brand-violet text-white">
              AI
            </span>
            {site.companyName}科技
          </div>
          <p className="mt-3 text-sm text-slate-400">{site.slogan}</p>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white">产品</h4>
          <ul className="mt-3 space-y-2 text-sm text-slate-400">
            <li><Link href="/products" className="hover:text-white">产品与方案</Link></li>
            <li><Link href="/explore" className="hover:text-white">智能获客</Link></li>
            <li><Link href="/products/p3" className="hover:text-white">获客中台</Link></li>
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
        © {new Date().getFullYear()} {site.companyName}科技 版权所有 · {site.icp} · 仅作演示用途
      </div>
    </footer>
  );
}
