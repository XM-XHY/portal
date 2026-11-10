"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { SiteInfo } from "@/lib/store";
import { brandName } from "@/lib/brand";

const links = [
  { href: "/", label: "首页" },
  { href: "/products", label: "产品中心" },
  { href: "/works", label: "作品中心" },
  { href: "/cases", label: "客户案例" },
  { href: "/about", label: "关于我们" },
  { href: "/explore", label: "智能获客" },
  { href: "/balance", label: "均衡分班" },
  // 「数据看板」属经营数据，已改为登录后可见，入口放在管理后台头部，不再出现在公开导航。
];

export default function Navbar({ site }: { site: SiteInfo }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin");
  // 作品体验页是全屏沉浸式：站点导航、底部 CTA 都不渲染，把整块视口让给应用。
  // 注意只匹配 /works/xxx，不匹配 /works 列表页本身。
  const isImmersive = pathname?.startsWith("/works/") ?? false;

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

  // hooks 必须无条件执行完，所以放在 useEffect 之后再做条件返回
  if (isImmersive) return null;

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#06080f]/80 backdrop-blur-md md:backdrop-blur-xl">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-2.5 sm:px-6 sm:py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold" onClick={() => setOpen(false)}>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-blue to-brand-violet text-white">
              AI
            </span>
            <span className="whitespace-nowrap text-base tracking-tight sm:text-lg">
              {brandName(site.companyName)}
            </span>
          </Link>

          <ul className="hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className={`whitespace-nowrap rounded-lg px-2.5 py-2 text-sm transition hover:bg-white/10 hover:text-white ${
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
            {/* 窄屏已经有底部悬浮 CTA，顶部再放一个会挤掉品牌名，这里只在 sm 以上显示 */}
            <Link href="/explore" className="btn-primary hidden px-4 py-2 text-sm md:inline-flex">
              免费试用
            </Link>
            <button
              aria-label={open ? "关闭菜单" : "打开菜单"}
              aria-expanded={open}
              aria-controls="mobile-nav-menu"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-white/10 active:bg-white/10 md:hidden"
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
            <ul
              id="mobile-nav-menu"
              className="max-h-[calc(100dvh-8rem)] space-y-1 overflow-y-auto border-t border-white/10 px-3 py-3"
              style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
            >
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
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#06080f]/95 px-3 pt-2.5 backdrop-blur-md md:hidden"
          style={{ paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom))" }}
        >
          <div className="flex gap-2.5">
            <Link href="/explore" className="btn-primary flex-1 py-2.5 text-center text-sm">
              免费试用
            </Link>
            <Link href="/about#contact" className="btn-ghost flex-1 py-2.5 text-center text-sm">
              联系我们
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
