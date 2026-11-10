"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import type { Subscriber, AdminLog, SubStatus } from "@/lib/teacher-sub";

type LoadState = "loading" | "ready" | "error";
type Toast = { type: "ok" | "err"; text: string } | null;

/** 六态彩色标签（沿用站点深色配色） */
const STATUS_META: Record<SubStatus, { label: string; cls: string }> = {
  trial: { label: "试用中", cls: "border-sky-500/30 bg-sky-500/15 text-sky-300" },
  pending: { label: "待支付", cls: "border-amber-500/30 bg-amber-500/15 text-amber-300" },
  paid: { label: "已付费", cls: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300" },
  auto_renew: { label: "自动续费", cls: "border-brand-violet/30 bg-brand-violet/20 text-brand-violet" },
  expired: { label: "已到期", cls: "border-orange-500/30 bg-orange-500/15 text-orange-300" },
  disabled: { label: "权限停用", cls: "border-red-500/30 bg-red-500/15 text-red-300" },
};
const FALLBACK_STATUS_CLS = "border-white/15 bg-white/5 text-slate-300";

const TH = "whitespace-nowrap px-3 py-2.5 font-medium text-slate-400";
const TD = "whitespace-nowrap px-3 py-2.5 align-top text-slate-300";

function fmtDate(v?: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function fmtText(v?: string | null): string {
  return v === undefined || v === null || String(v).trim() === "" ? "—" : String(v);
}

function StatusBadge({ status, statusText }: { status: string; statusText?: string }) {
  const meta = STATUS_META[status as SubStatus];
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta?.cls || FALLBACK_STATUS_CLS}`}>
      {meta?.label || statusText || status || "—"}
    </span>
  );
}

export default function TeacherSubPage() {
  const [users, setUsers] = useState<Subscriber[]>([]);
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [kwInput, setKwInput] = useState("");
  const [appliedKw, setAppliedKw] = useState("");

  // 手动开通表单
  const [grantMode, setGrantMode] = useState<"days" | "until">("days");
  const [gAccount, setGAccount] = useState("");
  const [gDays, setGDays] = useState("30");
  const [gUntil, setGUntil] = useState("");
  const [gNote, setGNote] = useState("");

  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [confirmAcc, setConfirmAcc] = useState("");
  const [disableNote, setDisableNote] = useState("");

  const load = useCallback(async (keyword: string) => {
    setLoadState("loading");
    setError("");
    try {
      const qs = keyword ? `?kw=${encodeURIComponent(keyword)}` : "";
      const res = await fetch(`/api/admin/teacher-sub${qs}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setError("未登录或登录已失效，请先登录管理后台");
        setLoadState("error");
        return;
      }
      if (res.status === 403) {
        setError("当前账号无权限访问「教师工作台订阅」管理");
        setLoadState("error");
        return;
      }
      if (!res.ok) throw new Error(data.error || `接口返回 ${res.status}`);
      setUsers(Array.isArray(data.users) ? data.users : []);
      setLogs(Array.isArray(data.logs) ? data.logs : []);
      setLoadState("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    load("");
  }, [load]);

  async function postAction(body: Record<string, unknown>): Promise<void> {
    const res = await fetch("/api/admin/teacher-sub", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `操作失败（${res.status}）`);
  }

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    const k = kwInput.trim();
    setAppliedKw(k);
    load(k);
  }

  function resetSearch() {
    setKwInput("");
    setAppliedKw("");
    load("");
  }

  async function submitGrant(e: FormEvent) {
    e.preventDefault();
    setToast(null);
    const account = gAccount.trim();
    if (!account) {
      setToast({ type: "err", text: "请填写教师工作台账号" });
      return;
    }
    const body: Record<string, unknown> = { action: "grant", account };
    if (grantMode === "days") {
      const n = Number(gDays);
      if (!Number.isInteger(n) || n < 1 || n > 3650) {
        setToast({ type: "err", text: "天数需为 1-3650 的整数" });
        return;
      }
      body.days = n;
    } else {
      const u = gUntil.trim();
      if (!u) {
        setToast({ type: "err", text: "请填写到期日（合法 ISO 日期）" });
        return;
      }
      body.until = u;
    }
    if (gNote.trim()) body.note = gNote.trim();

    setBusy(true);
    try {
      await postAction(body);
      setToast({ type: "ok", text: `已为「${account}」开通 / 延长使用期限` });
      setGAccount("");
      setGNote("");
      await load(appliedKw);
    } catch (e) {
      setToast({ type: "err", text: e instanceof Error ? e.message : "开通失败" });
    } finally {
      setBusy(false);
    }
  }

  async function doDisable() {
    const account = confirmAcc;
    if (!account) return;
    setBusy(true);
    setToast(null);
    try {
      await postAction({
        action: "disable",
        account,
        ...(disableNote.trim() ? { note: disableNote.trim() } : {}),
      });
      setToast({ type: "ok", text: `已停用「${account}」的教师工作台订阅权限` });
      setConfirmAcc("");
      setDisableNote("");
      await load(appliedKw);
    } catch (e) {
      setToast({ type: "err", text: e instanceof Error ? e.message : "停用失败" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#06080f]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-sm text-slate-400 hover:text-white">
              ← 返回后台
            </Link>
            <span className="text-white/20">/</span>
            <span className="font-semibold text-white">教师工作台订阅</span>
          </div>
          <span className="hidden text-xs text-slate-500 sm:inline">
            订阅数据由云函数 ent 提供 · 全部经本站服务端代理
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-2xl font-bold text-white">教师工作台订阅管理</h1>
          <p className="mt-1 text-sm text-slate-400">
            查看教师账号订阅状态、手动开通 / 延长使用期限、停用权限，并追溯最近管理操作。
          </p>
        </div>

        {toast && (
          <div
            className={`rounded-xl border p-3 text-sm ${
              toast.type === "ok"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-red-500/40 bg-red-500/10 text-red-300"
            }`}
          >
            {toast.type === "ok" ? "✓ " : "✕ "}
            {toast.text}
            <button
              onClick={() => setToast(null)}
              className="ml-3 text-xs opacity-70 hover:opacity-100"
            >
              关闭
            </button>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* 搜索 */}
          <section className="glass p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-white">🔍 搜索账号</h2>
            <form onSubmit={submitSearch} className="mt-3 flex flex-wrap gap-2">
              <input
                value={kwInput}
                onChange={(e) => setKwInput(e.target.value)}
                placeholder="按账号关键字筛选（留空显示全部）"
                className="input-base min-w-[12rem] flex-1"
              />
              <button type="submit" className="btn-primary px-4 py-2 text-sm">
                搜索
              </button>
              <button type="button" onClick={resetSearch} className="btn-ghost px-4 py-2 text-sm">
                重置
              </button>
            </form>
            {appliedKw && loadState === "ready" && (
              <p className="mt-2 text-xs text-slate-500">
                当前筛选：「{appliedKw}」· 共 {users.length} 条
              </p>
            )}
          </section>

          {/* 手动开通 / 延长使用期限 */}
          <section className="glass p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-white">✚ 手动开通 / 延长使用期限</h2>
            <p className="mt-1 text-xs text-slate-500">仅在此后台提供；前端应用不存在该入口。</p>
            <form onSubmit={submitGrant} className="mt-3 space-y-3">
              <input
                value={gAccount}
                onChange={(e) => setGAccount(e.target.value)}
                placeholder="教师工作台账号"
                className="input-base"
              />
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-1.5 text-slate-300">
                  <input
                    type="radio"
                    checked={grantMode === "days"}
                    onChange={() => setGrantMode("days")}
                  />
                  按天数
                </label>
                <label className="flex items-center gap-1.5 text-slate-300">
                  <input
                    type="radio"
                    checked={grantMode === "until"}
                    onChange={() => setGrantMode("until")}
                  />
                  指定到期日
                </label>
              </div>
              {grantMode === "days" ? (
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={gDays}
                  onChange={(e) => setGDays(e.target.value)}
                  placeholder="天数（1-3650 整数）"
                  className="input-base"
                />
              ) : (
                <input
                  value={gUntil}
                  onChange={(e) => setGUntil(e.target.value)}
                  placeholder="到期日，如 2026-12-31 或 2026-12-31T00:00:00Z"
                  className="input-base"
                />
              )}
              <input
                value={gNote}
                onChange={(e) => setGNote(e.target.value)}
                placeholder="备注（可选，≤200 字）"
                maxLength={200}
                className="input-base"
              />
              <button
                type="submit"
                disabled={busy}
                className="btn-primary w-full px-4 py-2 text-sm disabled:opacity-50"
              >
                {busy ? "处理中…" : "确认开通"}
              </button>
            </form>
          </section>
        </div>

        {/* 订阅账号列表 */}
        <section className="glass p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">📋 订阅账号列表</h2>
            <span className="text-xs text-slate-500">共 {users.length} 个账号</span>
          </div>

          {confirmAcc && (
            <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm">
              <p className="text-red-200">
                二次确认：确定停用账号 <span className="font-semibold text-white">{confirmAcc}</span>{" "}
                的教师工作台订阅权限吗？该操作会写入站内审计日志。
              </p>
              <input
                value={disableNote}
                onChange={(e) => setDisableNote(e.target.value)}
                placeholder="停用备注（可选，≤200 字）"
                maxLength={200}
                className="input-base mt-3"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={doDisable}
                  disabled={busy}
                  className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
                >
                  {busy ? "处理中…" : "确认停用"}
                </button>
                <button
                  onClick={() => {
                    setConfirmAcc("");
                    setDisableNote("");
                  }}
                  className="btn-ghost px-4 py-2 text-sm"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {loadState === "loading" && (
            <p className="py-12 text-center text-sm text-slate-400">加载中…</p>
          )}

          {loadState === "error" && (
            <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
              {error}
              <div className="mt-2">
                <Link href="/admin" className="underline hover:text-red-200">
                  前往后台登录
                </Link>
                {" · "}
                <button onClick={() => load(appliedKw)} className="underline hover:text-red-200">
                  重试
                </button>
              </div>
            </div>
          )}

          {loadState === "ready" && users.length === 0 && (
            <p className="py-12 text-center text-sm text-slate-500">
              {appliedKw ? "没有匹配的账号，试试其它关键字" : "暂无订阅账号"}
            </p>
          )}

          {loadState === "ready" && users.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[1180px] text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className={TH}>账号</th>
                    <th className={TH}>注册时间</th>
                    <th className={TH}>试用到期</th>
                    <th className={TH}>付费到期</th>
                    <th className={TH}>使用期限(validUntil)</th>
                    <th className={TH}>状态</th>
                    <th className={TH}>付费 / 续费状态</th>
                    <th className={TH}>权限状态</th>
                    <th className={TH}>自动续费</th>
                    <th className={TH}>网站账号关联</th>
                    <th className={TH}>操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {users.map((u) => (
                    <tr key={u.account} className="hover:bg-white/5">
                      <td className={TD}>
                        <span className="font-medium text-slate-100">{fmtText(u.account)}</span>
                        <p className="mt-1 text-slate-500">最近下单：{fmtDate(u.lastOrderAt)}</p>
                      </td>
                      <td className={TD}>{fmtDate(u.registeredAt)}</td>
                      <td className={TD}>{fmtDate(u.trialUntil)}</td>
                      <td className={TD}>{fmtDate(u.paidUntil)}</td>
                      <td className={TD}>
                        <span className="text-slate-200">{fmtDate(u.validUntil)}</span>
                        {u.grantedUntil && (
                          <p className="mt-1 text-slate-500">手动授予至：{fmtDate(u.grantedUntil)}</p>
                        )}
                      </td>
                      <td className={TD}>
                        <StatusBadge status={u.status} statusText={u.statusText} />
                      </td>
                      <td className={TD}>
                        <div>付费：{fmtText(u.payState)}</div>
                        <div className="mt-1">续费：{fmtText(u.renewState)}</div>
                      </td>
                      <td className={TD}>{fmtText(u.permission)}</td>
                      <td className={TD}>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs ${
                            u.autoRenew
                              ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                              : "border-white/10 bg-white/5 text-slate-400"
                          }`}
                        >
                          {u.autoRenew ? "已开启" : "未开启"}
                        </span>
                      </td>
                      <td className={TD}>
                        {u.siteLink ? (
                          <div>
                            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-300">
                              {fmtText(u.siteLink.status)}
                            </span>
                            {u.siteLink.siteUserId && (
                              <p className="mt-1 text-slate-500">ID：{u.siteLink.siteUserId}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500">未关联</span>
                        )}
                      </td>
                      <td className={TD}>
                        <button
                          onClick={() => {
                            setConfirmAcc(u.account);
                            setDisableNote("");
                          }}
                          disabled={busy || u.status === "disabled"}
                          className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 transition hover:bg-red-500/20 disabled:opacity-40"
                        >
                          {u.status === "disabled" ? "已停用" : "停用"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 最近操作日志 */}
        <section className="glass p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">🕒 最近操作日志</h2>
            <span className="text-xs text-slate-500">最近 {logs.length} 条</span>
          </div>
          {logs.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">暂无操作日志</p>
          ) : (
            <ul className="mt-4 divide-y divide-white/5">
              {logs.map((l, i) => (
                <li
                  key={`${l.at}-${i}`}
                  className="flex flex-wrap items-start justify-between gap-2 py-2.5 text-xs"
                >
                  <div className="min-w-0">
                    <span className="font-medium text-slate-200">{fmtText(l.action)}</span>
                    <span className="mx-2 text-slate-500">·</span>
                    <span className="text-slate-300">{fmtText(l.target)}</span>
                    <span className="ml-2 text-slate-500">操作人 {fmtText(l.actor)}</span>
                    {l.detail && <p className="mt-1 text-slate-500">{l.detail}</p>}
                  </div>
                  <span className="shrink-0 text-slate-500">{fmtDate(l.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
