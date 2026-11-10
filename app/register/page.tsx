"use client";

import { useState } from "react";
import Link from "next/link";

function validUsername(v: string): boolean {
  return /^[a-zA-Z0-9_\-]{2,40}$/.test(v.trim());
}
function validPassword(v: string): boolean {
  return v.length >= 8 && v.length <= 128 && /[A-Za-z]/.test(v) && /[0-9]/.test(v);
}

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setInfo("");
    if (!validUsername(username)) {
      setErr("账号需为 2-40 位字母、数字、下划线或中划线");
      return;
    }
    if (!validPassword(password)) {
      setErr("密码需 8-128 位，且同时包含字母与数字");
      return;
    }
    if (password !== confirm) {
      setErr("两次输入的密码不一致");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "注册失败");
      setInfo(`账号「${d.username}」注册成功！请前往分班查询页登录使用。`);
      setUsername("");
      setPassword("");
      setConfirm("");
    } catch (e: any) {
      setErr(e.message || "注册失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#06080f] px-4">
      <div className="glass w-full max-w-md p-8">
        <h1 className="text-2xl font-bold text-center text-white">教师注册</h1>
        <p className="mt-2 text-center text-sm text-slate-400">
          注册后用于「分班查询码管理」（家长分班结果发布与查询）。
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-xs text-slate-400">
            账号
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="2-40 位字母/数字/下划线"
              className="input-base mt-1 w-full"
              autoComplete="username"
            />
          </label>
          <label className="block text-xs text-slate-400">
            密码
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 8 位，含字母与数字"
              className="input-base mt-1 w-full"
              autoComplete="new-password"
            />
          </label>
          <label className="block text-xs text-slate-400">
            确认密码
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="再次输入密码"
              className="input-base mt-1 w-full"
              autoComplete="new-password"
            />
          </label>

          {err && <p className="text-sm text-red-400">{err}</p>}

          <button type="submit" disabled={busy} className="btn-primary w-full disabled:opacity-50">
            {busy ? "注册中…" : "注册并创建账号"}
          </button>
        </form>

        {info && (
          <div className="mt-4 rounded-lg border border-emerald-400/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
            {info}
            <div className="mt-3">
              <Link href="/balance" className="text-brand-cyan hover:underline">
                前往分班查询页登录 →
              </Link>
            </div>
          </div>
        )}

        <p className="mt-5 text-center text-xs text-slate-500">
          已有账号？
          <Link href="/balance" className="text-brand-cyan hover:underline">前往分班查询页登录</Link>
          {" · "}
          <Link href="/" className="text-brand-cyan hover:underline">返回官网</Link>
        </p>
      </div>
    </main>
  );
}
