"use client";

import { useState } from "react";

type Props = {
  title?: string;
  subtitle?: string;
  contextLabel?: string; // 预填的需求说明标签，如「预约演示：智能客服 Copilot」
  compact?: boolean;
};

export default function LeadForm({ title = "预约演示", subtitle, contextLabel, compact }: Props) {
  const [form, setForm] = useState({ name: "", phone: "", company: "", query: contextLabel || "" });
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!form.name || !form.phone) {
      setErr("请填写称呼与联系电话");
      return;
    }
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) setDone(true);
    else setErr("提交失败，请稍后重试");
  }

  if (done) {
    return (
      <div className="glass p-8 text-center">
        <div className="text-3xl">✅</div>
        <h3 className="mt-3 text-xl font-semibold text-white">提交成功</h3>
        <p className="mt-2 text-slate-400">我们的顾问将尽快与您联系，为您定制 AI 落地方案。</p>
      </div>
    );
  }

  return (
    <div className={`glass ${compact ? "p-6" : "p-8"}`}>
      <h3 className={`font-semibold text-white ${compact ? "text-lg" : "text-2xl"}`}>{title}</h3>
      {subtitle && <p className="mt-2 text-sm text-slate-400">{subtitle}</p>}
      <form onSubmit={submit} className="mt-5 grid gap-3 sm:grid-cols-2">
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="您的称呼 *"
          className="input-base"
        />
        <input
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          placeholder="联系电话 *"
          className="input-base"
          inputMode="tel"
        />
        <input
          value={form.company}
          onChange={(e) => setForm({ ...form, company: e.target.value })}
          placeholder="公司名称"
          className="input-base"
        />
        <input
          value={form.query}
          onChange={(e) => setForm({ ...form, query: e.target.value })}
          placeholder="需求说明（选填）"
          className="input-base"
        />
        {err && <p className="sm:col-span-2 text-sm text-red-400">{err}</p>}
        <button type="submit" className="btn-primary sm:col-span-2">
          提交申请
        </button>
      </form>
    </div>
  );
}
