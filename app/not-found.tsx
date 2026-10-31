import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center px-4 py-20 text-center">
      <div className="text-7xl font-bold text-gradient">404</div>
      <h1 className="mt-4 text-xl font-semibold text-white">页面不存在或已移动</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">
        你访问的地址可能已失效。如果浏览器缓存了旧页面，请按
        <kbd className="mx-1 rounded border border-white/20 px-1.5 py-0.5 text-xs">Ctrl</kbd>+
        <kbd className="mx-1 rounded border border-white/20 px-1.5 py-0.5 text-xs">F5</kbd>
        强制刷新，或从下方入口重新进入。
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link href="/" className="btn-primary px-5 py-2.5 text-sm">返回首页</Link>
        <Link href="/explore" className="btn-ghost px-5 py-2.5 text-sm">智能获客</Link>
        <Link href="/products" className="btn-ghost px-5 py-2.5 text-sm">产品方案</Link>
      </div>
    </main>
  );
}
