"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

/**
 * 支付门禁组件（真实支付优先）。
 * 主流程：点击 → 创建支付订单（微信/支付宝网关生成扫码支付码）→ 弹窗展示二维码 → 轮询订单状态；
 *        网关异步回调确认支付成功后（前端轮询感知）自动执行 onGranted（真正下载/导出）。
 * 兜底：未配置真实商户通道但管理员上传了自助收款二维码时，退回「自助扫码」模式，避免下载不可用。
 * 免费商品直接放行。
 */
export default function PayGate({
  productId,
  label,
  className,
  onGranted,
  client,
}: {
  productId: string;
  label: string;
  className?: string;
  /** grant 为服务端签发的付费授权票据；受保护的服务端下载接口需要带上它 */
  onGranted: (grant?: string) => void;
  client?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // 真实支付
  const [amount, setAmount] = useState(0);
  const [provider, setProvider] = useState<string>("");
  const [qrData, setQrData] = useState<string>(""); // 二维码图片 dataURL
  const [rawCode, setRawCode] = useState<string>(""); // 兜底：原始支付码文本
  const [orderId, setOrderId] = useState<string>("");
  const [paid, setPaid] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  // 自助扫码兜底
  const [selfMode, setSelfMode] = useState(false);
  const [selfQr, setSelfQr] = useState("");
  const [selfNote, setSelfNote] = useState("");
  const [selfBusy, setSelfBusy] = useState(false);
  const [selfErr, setSelfErr] = useState("");

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const grantedRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  function stopPolling() {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }

  async function begin() {
    if (loading || open) return;
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/pay/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, client }),
      });
      const data = await res.json().catch(() => ({}));

      if (data.free) {
        onGranted(data.grant); // 免费，带免费票据放行（服务端接口统一校验）
        return;
      }

      // 兜底：自助扫码（未配置真实通道 + 管理员上传了收款码）
      if (data.self && data.qrImageUrl) {
        setSelfMode(true);
        setSelfQr(data.qrImageUrl);
        setSelfNote(data.qrNote || "微信 / 支付宝 扫码支付");
        setAmount(data.amount);
        setProvider("");
        setSelfErr("");
        setOpen(true);
        return;
      }

      if (!res.ok || !data.orderId) {
        setErr(data.error || "创建支付订单失败，请稍后再试或联系管理员");
        setSelfMode(false);
        setOpen(true);
        return;
      }

      setSelfMode(false);
      setOrderId(data.orderId);
      setAmount(data.amount);
      setProvider(data.provider);
      setPaid(false);
      // 生成可扫描的二维码
      try {
        const url = await QRCode.toDataURL(data.codeUrl, { width: 240, margin: 1 });
        setQrData(url);
      } catch {
        setRawCode(data.codeUrl);
      }
      setOpen(true);
      startPolling(data.orderId);
    } catch (e: any) {
      setErr(e?.message || "网络异常，创建订单失败");
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }

  function startPolling(id: string) {
    stopPolling();
    timer.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/pay/order?id=${encodeURIComponent(id)}`, { cache: "no-store" });
        const d = await r.json().catch(() => ({}));
        if (d.paid && !grantedRef.current) {
          grantedRef.current = true;
          stopPolling();
          setPaid(true);
          const grant = d.grant as string | undefined;
          setTimeout(() => {
            setOpen(false);
            onGranted(grant);
          }, 700);
        }
        if (d.expiresAt) {
          const left = Math.max(0, Math.floor((new Date(d.expiresAt).getTime() - Date.now()) / 1000));
          setSecondsLeft(left);
          if (left <= 0 && !grantedRef.current) {
            stopPolling();
            setErr("订单已超时，请重新点击下载以获取新二维码");
          }
        }
      } catch {
        /* 轮询失败忽略，下一周期重试 */
      }
    }, 2000);
  }

  /**
   * 自助扫码：点击「我已完成支付」必须向服务端申报。
   * 服务端写审计日志留痕并签发 short-lived self 票据，前端再凭票据请求下载接口。
   * 不再像旧版那样前端直接放行、服务端毫无记录。
   */
  async function confirmSelfPaid() {
    setSelfBusy(true);
    setSelfErr("");
    try {
      const r = await fetch("/api/pay/self-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, client }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.grant) throw new Error(d.error || "付款申报失败，请稍后重试");
      setOpen(false);
      onGranted(d.grant as string);
    } catch (e: any) {
      setSelfErr(e?.message || "付款申报失败，请稍后重试");
    } finally {
      setSelfBusy(false);
    }
  }

  // 模拟支付（仅 mock 模式，便于联调）：通知后端标记已支付
  async function simulatePaid() {
    try {
      await fetch("/api/pay/mock-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
    } catch {}
  }

  useEffect(() => () => stopPolling(), []);

  // A-03：付费弹窗是可键盘/读屏操作的关键路径。
  // 打开时把焦点移入模态框，ESC 可关闭，避免键盘用户被困在遮罩里无法退出。
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        stopPolling();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <button onClick={begin} disabled={loading} className={className}>
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4" onClick={() => { stopPolling(); setOpen(false); }}>
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="paygate-title"
            tabIndex={-1}
            className="glass w-full max-w-sm p-6 text-center outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-2xl" aria-hidden="true">{selfMode ? "💰" : "💳"}</div>
            <h3 id="paygate-title" className="mt-2 text-lg font-semibold text-white">
              {selfMode ? "扫码支付后下载（自助）" : "扫码支付后下载"}
            </h3>
            <p className="mt-1 text-sm text-slate-400">
              应付金额
              <span className="mx-1 text-2xl font-bold text-brand-cyan">¥{amount}</span>
            </p>

            {err && !paid && !selfMode ? (
              <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-3 text-sm text-red-300">
                {err}
              </div>
            ) : selfMode ? (
              <>
                <div className="mt-4 flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={selfQr} alt="收款二维码" className="h-52 w-52 rounded-lg border border-white/10 bg-white object-contain p-2" />
                </div>
                <p className="mt-3 text-xs text-slate-400">
                  {selfNote}
                  <br />
                  扫码付款后点击下方按钮申报，管理员会核对到账记录
                </p>
                {selfErr && <p className="mt-2 text-xs text-red-400">{selfErr}</p>}
                <div className="mt-5 flex gap-2">
                  <button onClick={confirmSelfPaid} disabled={selfBusy} className="btn-primary flex-1 disabled:opacity-50">
                    {selfBusy ? "申报中…" : "我已完成支付，下载"}
                  </button>
                  <button onClick={() => setOpen(false)} className="btn-ghost">取消</button>
                </div>
              </>
            ) : (
              <>
                <div className="mt-4 flex justify-center">
                  {qrData ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qrData} alt="支付二维码" className="h-52 w-52 rounded-lg border border-white/10 bg-white object-contain p-2" />
                  ) : (
                    <div className="mx-auto flex h-52 w-52 items-center justify-center break-all rounded-lg border border-dashed border-white/20 bg-white/5 px-3 text-xs text-slate-400">
                      {rawCode || "生成二维码中…"}
                    </div>
                  )}
                </div>

                <p className="mt-3 text-xs text-slate-400">
                  {provider === "wechat" && "请使用微信「扫一扫」支付"}
                  {provider === "alipay" && "请使用支付宝「扫一扫」支付"}
                  {provider === "mock" && "当前为模拟支付（开发模式）"}
                  {!provider && "请使用对应 App 扫码支付"}
                  <br />
                  支付成功后本窗口将自动解锁下载（无需手动确认）
                </p>

                {secondsLeft > 0 && !paid && (
                  <p className="mt-1 text-xs text-amber-400">二维码有效期 {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}</p>
                )}

                {paid && <p className="mt-3 text-sm text-emerald-400">✅ 支付成功，正在准备下载…</p>}

                {provider === "mock" && !paid && (
                  <button onClick={simulatePaid} className="btn-primary mt-3 w-full">
                    模拟支付成功（开发用）
                  </button>
                )}

                <div className="mt-5 flex gap-2">
                  {!paid && (
                    <button onClick={() => orderId && startPolling(orderId)} className="btn-ghost flex-1">
                      我已支付，刷新
                    </button>
                  )}
                  <button onClick={() => { stopPolling(); setOpen(false); }} className="btn-ghost">
                    取消
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
