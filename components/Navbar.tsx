"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { SiteInfo } from "@/lib/store";

const links = [
  { href: "/", label: "首页" },
  { href: "/products", label: "产品方案" },
  { href: "/cases", label: "客户案例" },
  { href: "/about", label: "关于我们" },
  { href: "/explore", label: "智能获客" },
];

export default function Navbar({ site }: { site: SiteInfo }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin");

  // 打开抽屉时锁定页面滚动 + 支持 ESC 关闭
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#06080f]/70 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold" onClick={() => setOpen(false)}>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-blue to-brand-violet text-white">
              AI
            </span>
            <span className="text-lg tracking-tight">
              {site.companyName}
              <span className="text-gradient">科技</span>
            </span>
          </Link>

          <ul className="hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className={`rounded-lg px-3 py-2 text-sm transition hover:bg-white/10 hover:text-white ${
                    pathname === l.href ? "text-white" : "text-slate-300"
                  }`}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2">
            <Link href="/admin" className="btn-ghost hidden px-4 py-2 text-sm sm:inline-flex">
              后台登录
            </Link>
            <Link href="/explore" className="btn-primary px-4 py-2 text-sm">
              免费试用
            </Link>
            <button
              aria-label="打开菜单"
              aria-expanded={open}
              className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 md:hidden"
              onClick={() => setOpen((v) => !v)}
            >
              <span className="text-xl leading-none">{open ? "✕" : "☰"}</span>
            </button>
          </div>
        </nav>

        {/* 移动端抽屉：CSS Grid 0fr→1fr 高度动画 */}
        <div
          className={`grid transition-all duration-300 ease-out md:hidden ${
            open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="overflow-hidden">
            <ul className="space-y-1 border-t border-white/10 px-4 py-3">
              {links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className={`block rounded-lg px-3 py-3 text-base ${
                      pathname === l.href ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/10"
                    }`}
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/admin"
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-3 text-base text-slate-300 hover:bg-white/10"
                >
                  后台登录
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </header>

      {/* 抽屉遮罩 */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* 移动端底部悬浮 CTA（后台页不显示） */}
      {!isAdmin && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#06080f]/90 px-4 py-3 backdrop-blur-xl md:hidden">
          <div className="flex gap-3">
            <Link href="/explore" className="btn-primary flex-1 py-3 text-center text-sm">
              免费试用
            </Link>
            <Link href="/about#contact" className="btn-ghost flex-1 py-3 text-center text-sm">
              联系我们
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
