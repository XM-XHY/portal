"use client";

import { useState } from "react";

/**
 * 通用「支付后下载」门禁组件。
 * 点击触发按钮 → 拉取付费配置 → 若该商品需付费且金额>0 则弹出收款二维码；
 * 用户确认支付后调用 onGranted（真正执行下载/导出）。免费商品直接放行。
 *
 * 注意：本组件为纯前端，不引入任何服务端模块。配置类型按结构内联定义。
 */

type Cfg = {
  qrImageUrl: string;
  qrNote: string;
  items: Record<string, { paid: boolean; amount: number }>;
};

export default function PayGate({
  productId,
  label,
  className,
  onGranted,
}: {
  productId: string;
  label: string;
  className?: string;
  onGranted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [amount, setAmount] = useState(0);

  async function begin() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/payconfig", { cache: "no-store" });
      const c: Cfg = await res.json();
      setCfg(c);
      const item = c.items?.[productId];
      if (item && item.paid && item.amount > 0) {
        setAmount(item.amount);
        setOpen(true);
      } else {
        onGranted(); // 免费，直接放行
      }
    } catch {
      onGranted(); // 配置读取失败也放行，避免卡死
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button onClick={begin} disabled={loading} className={className}>
        {label}
      </button>

      {open && cfg && (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="glass w-full max-w-sm p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-2xl">💰</div>
            <h3 className="mt-2 text-lg font-semibold text-white">该资源需支付后下载</h3>
            <p className="mt-1 text-sm text-slate-400">
              应付金额
              <span className="mx-1 text-2xl font-bold text-brand-cyan">¥{amount}</span>
            </p>

            {cfg.qrImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cfg.qrImageUrl}
                alt="收款二维码"
                className="mx-auto mt-4 h-48 w-48 rounded-lg border border-white/10 bg-white object-contain p-2"
              />
            ) : (
              <div className="mx-auto mt-4 flex h-48 w-48 items-center justify-center rounded-lg border border-dashed border-white/20 bg-white/5 text-xs text-slate-400">
                管理员尚未设置收款二维码
              </div>
            )}

            <p className="mt-3 text-xs text-slate-400">
              {cfg.qrNote || "微信 / 支付宝 扫码支付"}
              <br />
              扫码支付完成后，点击下方按钮即可下载。
            </p>

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => {
                  setOpen(false);
                  onGranted();
                }}
                className="btn-primary flex-1"
              >
                我已完成支付，下载
              </button>
              <button onClick={() => setOpen(false)} className="btn-ghost">
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
