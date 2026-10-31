"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** 企业知识中枢登录页：员工账号由管理员在后台开通 */
export default function HubLogin() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "登录失败");
      router.refresh(); // 服务端重新读取会话，渲染门户
    } catch (e: any) {
      setErr(e.message || "登录失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="glass w-full max-w-sm p-8">
        <div className="text-center">
          <span className="inline-grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-blue to-brand-violet text-3xl">
            📚
          </span>
          <h1 className="mt-4 text-2xl font-bold">企业知识中枢</h1>
          <p className="mt-2 text-sm text-slate-400">
            检索公司知识资产 · 对话生成材料并下载
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="员工账号"
            autoComplete="username"
            className="input-base mt-6"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码"
            autoComplete="current-password"
            className="input-base"
          />
          {err && <p className="text-sm text-red-400">{err}</p>}
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? "登录中…" : "登录"}
          </button>
        </form>

        <div className="mt-4 rounded-lg border border-white/10 p-3 text-xs text-slate-400">
          员工账号与初始密码由管理员在后台「用户与角色 → 员工账号」中开通；忘记密码请联系管理员重置。
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">
          <Link href="/" className="text-brand-cyan hover:underline">返回官网</Link>
          {" · "}
          <Link href="/admin" className="text-slate-400 hover:text-white">管理员后台</Link>
        </p>
      </div>
    </main>
  );
}
