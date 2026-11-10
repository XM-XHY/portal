"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  id: string;
  name: string;
  subtitle: string;
  accessNote: string;
};

/**
 * 全屏作品体验壳。
 *
 * 为什么不用「页面里嵌一个固定高度的 iframe」：
 * 手机上外层文档和 iframe 内部各有一条滚动条，手指滑动会被外层吃掉，
 * 加上站点导航 / 底部 CTA / 客服悬浮球，375px 的屏幕几乎没剩多少可用高度。
 * 这里让整页变成 h-[100dvh] 的 flex 容器，iframe 用 absolute inset-0 占满剩余空间，
 * 只保留 iframe 内部一条滚动链，才是移动端可用的形态。
 */
export default function WorkPlayer({ id, name, subtitle, accessNote }: Props) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [frameKey, setFrameKey] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  // 锁住外层滚动；离开页面时完整还原，避免影响其它路由
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevHeight = document.body.style.height;
    document.body.style.overflow = "hidden";
    document.body.style.height = "100dvh";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.height = prevHeight;
    };
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
      return;
    }
    const el = shellRef.current;
    if (el?.requestFullscreen) {
      try {
        await el.requestFullscreen();
        return;
      } catch {
        // iOS Safari / 部分微信 WebView 不支持元素全屏，走下面的降级
      }
    }
    window.open(`/api/works/${id}`, "_blank", "noopener,noreferrer");
  }, [id]);

  const reload = useCallback(() => {
    setLoaded(false);
    setFrameKey((v) => v + 1);
  }, []);

  const appUrl = `/api/works/${id}`;
  const barBtn =
    "grid h-11 w-11 shrink-0 place-items-center rounded-xl text-slate-300 transition active:bg-white/10 hover:bg-white/10 hover:text-white";

  return (
    <main
      className="flex h-[100dvh] flex-col overflow-hidden bg-[#06080f]"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* 精简顶栏：站点导航、底部 CTA、客服球在这一路由下都由各自组件自行隐藏 */}
      <div className="flex h-14 shrink-0 items-center gap-0.5 border-b border-white/10 bg-[#06080f]/95 px-1.5 sm:gap-1 sm:px-3">
        <Link
          href="/works"
          aria-label="返回作品中心"
          className="inline-flex h-11 min-w-[44px] shrink-0 items-center justify-center gap-1 rounded-xl px-2 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white active:bg-white/10"
        >
          <span aria-hidden>←</span>
          <span className="hidden sm:inline">作品中心</span>
        </Link>

        <span className="mx-1 h-5 w-px shrink-0 bg-white/10" aria-hidden />

        <div className="min-w-0 flex-1 px-1">
          <h1 className="truncate text-sm font-medium text-slate-100">{name}</h1>
          <p className="hidden truncate text-xs text-slate-500 sm:block">{subtitle}</p>
        </div>

        <button type="button" onClick={reload} aria-label="重新加载作品" title="重新加载" className={barBtn}>
          <span aria-hidden className="text-lg leading-none">⟳</span>
        </button>
        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label={fullscreen ? "退出全屏" : "全屏体验"}
          title="全屏体验"
          className={barBtn}
        >
          <span aria-hidden className="text-base leading-none">⛶</span>
        </button>
        <a
          href={appUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="在新窗口打开作品"
          title="新窗口打开"
          className={barBtn}
        >
          <span aria-hidden className="text-base leading-none">↗</span>
        </a>
      </div>

      {/* iframe 容器：flex-1 + min-h-0 才能让子元素在 flex 列里正确收缩 */}
      <div ref={shellRef} className="relative min-h-0 flex-1 bg-white">
        {!loaded && (
          <div
            className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-3 bg-[#f5f7fa] px-8 text-center"
            role="status"
            aria-live="polite"
          >
            <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-blue-200 border-t-blue-600" />
            <p className="text-sm font-medium text-slate-700">正在加载「{name}」…</p>
            <p className="max-w-sm text-xs leading-relaxed text-slate-500">{accessNote}</p>
          </div>
        )}

        <iframe
          key={frameKey}
          src={appUrl}
          title={`${name} 在线体验`}
          className="absolute inset-0 h-full w-full border-0 bg-white"
          onLoad={() => setLoaded(true)}
          allow="clipboard-write; fullscreen"
          referrerPolicy="same-origin"
        />

        {fullscreen && (
          <button
            type="button"
            onClick={() => document.exitFullscreen().catch(() => {})}
            className="absolute right-3 top-3 z-[2] min-h-[44px] rounded-xl bg-slate-900/85 px-4 text-sm text-white shadow-lg"
          >
            退出全屏
          </button>
        )}
      </div>
    </main>
  );
}
