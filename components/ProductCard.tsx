"use client";

import Link from "next/link";
import type { ContentItem } from "@/lib/data/types";

/**
 * 首页产品卡片。智能客服类产品点击整卡打开 AI 客服对话窗
 * （与全局 ChatWidget 通过 window "open-chat" 事件联动）。
 */
export default function ProductCard({ product }: { product: ContentItem }) {
  const isChat =
    product.title.includes("客服") || /copilot/i.test(product.title);
  const isExplore = product.title.includes("获客");

  return (
    <Link
      href={isExplore ? "/explore" : `/products/${product.id}`}
      onClick={
        isChat
          ? (e) => {
              e.preventDefault();
              window.dispatchEvent(new Event("open-chat"));
            }
          : undefined
      }
      className="glass glass-hover group flex flex-col p-6"
    >
      <div className="grid h-12 w-12 place-items-center rounded-xl bg-white/5 text-2xl transition group-hover:scale-110">
        {product.icon || "📦"}
      </div>
      <div className="mt-4 inline-flex w-fit rounded-full bg-brand-violet/20 px-2.5 py-0.5 text-xs text-brand-violet">
        {product.tag}
      </div>
      <h3 className="mt-3 text-lg font-semibold text-white">{product.title}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-400">
        {product.summary}
      </p>
      <div className="mt-4 text-sm font-medium text-brand-blue transition group-hover:translate-x-1">
        {isChat ? "在线体验对话 →" : isExplore ? "进入获客工作台 →" : "查看详情 →"}
      </div>
    </Link>
  );
}
