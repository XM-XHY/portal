"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ROLE_LABELS,
  PERMISSION_LABELS,
  can,
  type Role,
  type Permission,
} from "@/lib/auth";

type Me = { username: string; role: Role } | null;

const PERM_ORDER: Permission[] = [
  "content.manage",
  "leads.view",
  "leads.export",
  "search.logs",
  "audit.view",
  "users.manage",
  "settings.manage",
];

export default function AdminPage() {
  const [me, setMe] = useState<Me>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<string>("");

  const loadMe = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setMe({ username: data.username, role: data.role });
      } else {
        setMe(null);
      }
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  if (loading) {
    return <Center><div className="text-slate-400">加载中…</div></Center>;
  }

  if (!me) {
    return <Login onOk={loadMe} />;
  }

  // 依据角色计算可见 Tab
  const allTabs: { key: string; label: string; perm: Permission }[] = [
    { key: "site", label: "站点设置", perm: "settings.manage" },
    { key: "content", label: "内容管理", perm: "content.manage" },
    { key: "kb", label: "知识库", perm: "content.manage" },
    { key: "leads", label: "线索管理", perm: "leads.view" },
    { key: "logs", label: "获客日志", perm: "search.logs" },
    { key: "audit", label: "操作审计", perm: "audit.view" },
    { key: "users", label: "用户与角色", perm: "users.manage" },
  ];
  const managedTabs = allTabs.filter((t) => can(me.role, t.perm));

  const tabs = [...managedTabs, { key: "security", label: "账号安全", perm: "settings.manage" as Permission }];
  const active = tab || tabs[0]?.key;

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#06080f]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <span className="font-semibold">管理后台</span>
          <div className="flex items-center gap-3 text-sm">
            <span className="rounded-full bg-brand-violet/20 px-3 py-1 text-brand-violet">
              {ROLE_LABELS[me.role]}
            </span>
            <span className="text-slate-400">{me.username}</span>
            <button
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                setMe(null);
              }}
              className="text-slate-400 hover:text-white"
            >
              退出
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-lg px-4 py-2 text-sm transition ${
                active === t.key
                  ? "bg-gradient-to-r from-brand-blue to-brand-violet text-white"
                  : "border border-white/15 text-slate-300 hover:bg-white/10"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {active === "site" && <SiteSettings />}
          {active === "content" && <ContentManager />}
          {active === "kb" && <KbManager />}
          {active === "leads" && <LeadsManager role={me.role} />}
          {active === "logs" && <SearchLogs />}
          {active === "audit" && <AuditViewer />}
          {active === "users" && <UsersManager />}
          {active === "security" && <SecuritySettings username={me.username} />}
        </div>
      </div>
    </main>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <main className="grid min-h-screen place-items-center px-4">{children}</main>;
}

function Login({ onOk }: { onOk: () => void }) {
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
      onOk();
    } catch (e: any) {
      setErr(e.message || "登录失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Center>
      <div className="glass w-full max-w-sm p-8">
        <h1 className="text-2xl font-bold text-center">后台登录</h1>
        <p className="mt-2 text-center text-sm text-slate-400">XX 科技管理平台</p>
        <form onSubmit={submit} className="space-y-4">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="账号"
            className="input-base mt-6"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码"
            className="input-base"
          />
          {err && <p className="text-sm text-red-400">{err}</p>}
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? "登录中…" : "登录"}
          </button>
        </form>
        <div className="mt-4 rounded-lg border border-white/10 p-3 text-xs text-slate-400">
          可用账号：<br />
          <code>admin</code>（超级管理员，全部权限）<br />
          <code>market</code>（线索管理员，仅线索与日志）<br />
          <span className="text-slate-500">口令由管理员设定，不再对外展示。</span>
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">
          仅演示用途 · <Link href="/" className="text-brand-cyan hover:underline">返回官网</Link>
        </p>
      </div>
    </Center>
  );
}

/* ---------------- 站点设置 ---------------- */
function SiteSettings() {
  const [form, setForm] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/site")
      .then((r) => r.json())
      .then(setForm);
  }, []);

  if (!form) return <div className="text-slate-400">加载中…</div>;

  const fields: [keyof typeof form, string][] = [
    ["companyName", "公司名称"],
    ["slogan", "品牌标语"],
    ["contactName", "联系人"],
    ["phone", "联系电话"],
    ["email", "邮箱"],
    ["address", "公司地址"],
    ["icp", "备案号"],
  ];

  async function save() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/site", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "保存失败");
      setMsg("已保存，刷新官网即可看到更新 ✅");
    } catch (e: any) {
      setMsg(e.message || "保存失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass max-w-2xl p-6">
      <h3 className="text-lg font-semibold text-white">企业信息设置</h3>
      <p className="mt-1 text-sm text-slate-400">
        修改后将同步到官网首页、页脚与联系板块。
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {fields.map(([k, label]) => (
          <label key={k as string} className="block">
            <span className="text-sm text-slate-400">{label}</span>
            <input
              value={form[k] ?? ""}
              onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              className="input-base mt-1"
            />
          </label>
        ))}
      </div>
      <button onClick={save} disabled={busy} className="btn-primary mt-5">
        {busy ? "保存中…" : "保存修改"}
      </button>
      {msg && <p className="mt-3 text-sm text-emerald-400">{msg}</p>}
    </div>
  );
}

/* ---------------- 内容管理（资讯 / 产品 / 案例，卡片化 + 类型筛选） ---------------- */
const TYPE_TABS: { key: "" | "news" | "product" | "case"; label: string }[] = [
  { key: "", label: "全部" },
  { key: "news", label: "资讯" },
  { key: "product", label: "产品" },
  { key: "case", label: "案例" },
];
const TYPE_BADGE: Record<string, string> = {
  news: "bg-brand-blue/20 text-brand-blue",
  product: "bg-brand-violet/20 text-brand-violet",
  case: "bg-brand-cyan/20 text-brand-cyan",
};
const TYPE_LABEL: Record<string, string> = { news: "资讯", product: "产品", case: "案例" };

type CForm = {
  id: string;
  type: "news" | "product" | "case";
  title: string;
  tag: string;
  summary: string;
  body: string;
  icon: string;
  tags: string;
  client: string;
  industry: string;
  result: string;
  at: string;
  order: string;
};

function ContentManager() {
  const [list, setList] = useState<any[]>([]);
  const [typeFilter, setTypeFilter] = useState<"" | "news" | "product" | "case">("");
  const [form, setForm] = useState<CForm>({
    id: "", type: "news", title: "", tag: "", summary: "", body: "", icon: "📄",
    tags: "", client: "", industry: "", result: "", at: "", order: "0",
  });

  const load = () =>
    fetch("/api/contents").then((r) => r.json()).then(setList);

  useEffect(() => { load(); }, []);

  const shown = useMemo(
    () => (typeFilter ? list.filter((n) => n.type === typeFilter) : list),
    [list, typeFilter]
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const isEdit = !!form.id;
    const res = await fetch("/api/contents", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      resetForm();
      setTypeFilter("");
      load();
    } else {
      const d = await res.json().catch(() => ({}));
      alert(d.error || "操作失败");
    }
  }

  function resetForm() {
    setForm({
      id: "", type: "news", title: "", tag: "", summary: "", body: "", icon: "📄",
      tags: "", client: "", industry: "", result: "", at: "", order: "0",
    });
  }

  function editItem(n: any) {
    setForm({
      id: n.id, type: n.type, title: n.title, tag: n.tag, summary: n.summary,
      body: n.body || "", icon: n.icon || "📄", tags: (n.tags || []).join("，"),
      client: n.client || "", industry: n.industry || "", result: n.result || "",
      at: n.at || "", order: String(n.order || 0),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function del(id: string) {
    if (!confirm("确认删除？")) return;
    await fetch(`/api/contents?id=${id}`, { method: "DELETE" });
    load();
  }

  const set = (k: keyof CForm, v: string) => setForm({ ...form, [k]: v });

  return (
    <div className="space-y-6">
      <div className="glass p-6">
        <h3 className="text-lg font-semibold text-white">
          {form.id ? "编辑内容" : "新增内容"}
        </h3>
        <form onSubmit={save} className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 flex flex-wrap gap-2">
            {(["news", "product", "case"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set("type", t)}
                className={`rounded-full px-3 py-1 text-xs ${form.type === t ? "bg-white/20 text-white" : "bg-white/5 text-slate-300"}`}
              >
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>

          <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="标题（必填）" className="input-base sm:col-span-2" required />
          <input value={form.tag} onChange={(e) => set("tag", e.target.value)} placeholder="分类标签，如：智能客服 / 金融" className="input-base" />
          <input value={form.order} onChange={(e) => set("order", e.target.value)} placeholder="排序（数字越小越靠前）" className="input-base" inputMode="numeric" />

          {form.type === "product" && (
            <input value={form.icon} onChange={(e) => set("icon", e.target.value)} placeholder="图标 Emoji，如 💬" className="input-base" />
          )}
          {form.type === "case" && (
            <>
              <input value={form.client} onChange={(e) => set("client", e.target.value)} placeholder="客户名称" className="input-base" />
              <input value={form.industry} onChange={(e) => set("industry", e.target.value)} placeholder="所属行业" className="input-base" />
              <input value={form.result} onChange={(e) => set("result", e.target.value)} placeholder="成效指标，如：成本 -35%" className="input-base sm:col-span-2" />
            </>
          )}

          <input value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="标签（逗号分隔，如：大模型，RAG）" className="input-base sm:col-span-2" />
          <input value={form.at} onChange={(e) => set("at", e.target.value)} placeholder="日期（如 2026-10-01，留空取今天）" className="input-base" />

          <textarea value={form.summary} onChange={(e) => set("summary", e.target.value)} placeholder="摘要（列表页展示）" rows={2} className="input-base resize-none sm:col-span-2" />
          <textarea value={form.body} onChange={(e) => set("body", e.target.value)} placeholder="正文详情（详情页展示，支持换行）" rows={4} className="input-base resize-none sm:col-span-2" />

          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" className="btn-primary">{form.id ? "保存" : "新增"}</button>
            {form.id && (
              <button type="button" onClick={resetForm} className="btn-ghost">取消</button>
            )}
          </div>
        </form>
      </div>

      <div className="glass p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-white">现有内容（{shown.length}/{list.length}）</h3>
          <div className="flex flex-wrap gap-2">
            {TYPE_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTypeFilter(t.key)}
                className={`rounded-full px-3 py-1 text-xs ${typeFilter === t.key ? "bg-white/20 text-white" : "bg-white/5 text-slate-300"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((n) => (
            <div key={n.id} className="glass-hover rounded-xl border border-white/10 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs ${TYPE_BADGE[n.type] || "bg-white/10 text-slate-300"}`}>{TYPE_LABEL[n.type] || n.type}</span>
                <div className="flex gap-1">
                  <button onClick={() => editItem(n)} className="rounded-lg border border-white/15 px-2 py-1 text-xs hover:bg-white/10">编辑</button>
                  <button onClick={() => del(n.id)} className="rounded-lg border border-red-500/30 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10">删除</button>
                </div>
              </div>
              <div className="mt-2 font-medium text-white">{n.title}</div>
              <div className="mt-1 text-xs text-slate-400 line-clamp-2">{n.summary}</div>
            </div>
          ))}
          {shown.length === 0 && (
            <p className="col-span-full p-4 text-center text-slate-500">暂无内容</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- 线索管理（筛选 / 分页 / 状态） ---------------- */
function LeadsManager({ role }: { role: Role }) {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = useCallback((p: number, overrideQ?: string, overrideStatus?: string) => {
    const query = overrideQ ?? q;
    const st = overrideStatus ?? status;
    const qs = new URLSearchParams({ page: String(p) });
    if (query) qs.set("q", query);
    if (st) qs.set("status", st);
    fetch(`/api/leads?${qs.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items || []);
        setTotal(d.total || 0);
        setPage(d.page || p);
      });
  }, [q, status]);

  useEffect(() => { load(1); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / 10));

  async function toggleStatus(l: any) {
    const next = l.status === "contacted" ? "new" : "contacted";
    setBusyId(l.id);
    await fetch("/api/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: l.id, status: next }),
    });
    setBusyId("");
    load(page);
  }

  return (
    <div className="glass p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-white">获客线索（共 {total} 条）</h3>
        {can(role, "leads.export") && (
          <a
            href={`/api/leads/export?q=${encodeURIComponent(q)}&status=${status}`}
            className="btn-ghost py-2 text-sm"
          >
            导出 CSV
          </a>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load(1)}
          placeholder="搜索称呼 / 手机 / 公司 / 关键词"
          className="input-base max-w-xs flex-1"
        />
        <select
          value={status}
          onChange={(e) => { const v = e.target.value; setStatus(v); load(1, undefined, v); }}
          className="input-base max-w-[8rem]"
        >
          <option value="">全部状态</option>
          <option value="new">新线索</option>
          <option value="contacted">已联系</option>
        </select>
        <button onClick={() => load(1)} className="btn-ghost py-3 text-sm">搜索</button>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-slate-400">
            <tr>
              <th className="p-2">时间</th>
              <th className="p-2">称呼</th>
              <th className="p-2">手机号</th>
              <th className="p-2">公司</th>
              <th className="p-2">关键词</th>
              <th className="p-2">状态</th>
              <th className="p-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((l) => (
              <tr key={l.id} className="border-t border-white/10">
                <td className="p-2 text-slate-400 whitespace-nowrap">{new Date(l.at).toLocaleString("zh-CN")}</td>
                <td className="p-2 text-white">{l.name}</td>
                <td className="p-2">{l.phone}</td>
                <td className="p-2">{l.company || "—"}</td>
                <td className="p-2 text-brand-cyan">{l.query || "—"}</td>
                <td className="p-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${l.status === "contacted" ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}`}>
                    {l.status === "contacted" ? "已联系" : "新线索"}
                  </span>
                </td>
                <td className="p-2">
                  <button
                    disabled={busyId === l.id}
                    onClick={() => toggleStatus(l)}
                    className="rounded-lg border border-white/15 px-2 py-1 text-xs hover:bg-white/10"
                  >
                    {l.status === "contacted" ? "转为新线索" : "标记已联系"}
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={7} className="p-4 text-center text-slate-500">暂无线索，去官网提交一条试试</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
          <span>第 {page} / {totalPages} 页</span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => load(page - 1)}
              className="rounded-lg border border-white/15 px-3 py-1 disabled:opacity-40 hover:bg-white/10"
            >
              上一页
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => load(page + 1)}
              className="rounded-lg border border-white/15 px-3 py-1 disabled:opacity-40 hover:bg-white/10"
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- 获客日志（列表 + 图表） ---------------- */
function SearchLogs() {
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/search-logs").then((r) => r.ok && r.json()).then((d) => d && setLogs(d));
  }, []);

  const top = useMemo(() => {
    const m = new Map<string, number>();
    logs.forEach((l) => m.set(l.q, (m.get(l.q) || 0) + 1));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [logs]);
  const maxTop = top[0]?.[1] || 1;

  const trend = useMemo(() => {
    const map = new Map<string, number>();
    logs.forEach((l) => {
      const d = l.at.slice(0, 10);
      map.set(d, (map.get(d) || 0) + 1);
    });
    const arr: { d: string; c: number }[] = [];
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const dt = new Date(today);
      dt.setDate(today.getDate() - i);
      const key = dt.toISOString().slice(0, 10);
      arr.push({ d: key.slice(5), c: map.get(key) || 0 });
    }
    return arr;
  }, [logs]);
  const maxTrend = Math.max(1, ...trend.map((t) => t.c));

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass p-6">
          <h3 className="text-lg font-semibold text-white">热门搜索词（Top {top.length}）</h3>
          <div className="mt-4 space-y-2">
            {top.map(([w, c]) => (
              <div key={w} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 truncate text-slate-300">{w}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-cyan to-brand-violet"
                    style={{ width: `${(c / maxTop) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right text-slate-400">{c}</span>
              </div>
            ))}
            {top.length === 0 && <p className="text-slate-500">暂无搜索记录</p>}
          </div>
        </div>

        <div className="glass p-6">
          <h3 className="text-lg font-semibold text-white">近 14 天搜索趋势</h3>
          <div className="mt-4 flex h-40 items-end gap-1.5">
            {trend.map((t) => (
              <div key={t.d} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-gradient-to-t from-brand-blue/40 to-brand-cyan"
                  style={{ height: `${(t.c / maxTrend) * 100}%`, minHeight: t.c ? 4 : 2 }}
                  title={`${t.d}: ${t.c}`}
                />
                <span className="text-[10px] text-slate-500">{t.d.slice(3)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="glass p-6">
        <h3 className="text-lg font-semibold text-white">原始搜索记录（{logs.length}）</h3>
        <ul className="mt-4 space-y-2">
          {logs.map((l, i) => (
            <li key={i} className="flex items-center gap-3 rounded-lg border border-white/10 p-3 text-sm">
              <span className="rounded-full bg-white/5 px-3 py-1 text-brand-cyan">{l.q}</span>
              <span className="text-slate-400">{new Date(l.at).toLocaleString("zh-CN")}</span>
              <span className="ml-auto text-slate-500">{l.ip}</span>
            </li>
          ))}
          {logs.length === 0 && (
            <li className="p-4 text-center text-slate-500">暂无搜索记录</li>
          )}
        </ul>
      </div>
    </div>
  );
}

/* ---------------- 操作审计 ---------------- */
function AuditViewer() {
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/audit").then((r) => r.ok && r.json()).then((d) => d && setLogs(d));
  }, []);

  const color = (a: string) =>
    a.startsWith("login") ? "bg-sky-500/20 text-sky-300"
    : a.startsWith("site") ? "bg-brand-blue/20 text-brand-blue"
    : a.startsWith("content") ? "bg-brand-violet/20 text-brand-violet"
    : a.startsWith("lead") ? "bg-brand-cyan/20 text-brand-cyan"
    : a.startsWith("password") ? "bg-emerald-500/20 text-emerald-300"
    : "bg-white/10 text-slate-300";

  return (
    <div className="glass p-6">
      <h3 className="text-lg font-semibold text-white">操作审计日志（{logs.length}）</h3>
      <p className="mt-1 text-sm text-slate-400">记录后台关键操作，便于追溯与责任界定。</p>
      <ul className="mt-4 space-y-2">
        {logs.map((l, i) => (
          <li key={i} className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 p-3 text-sm">
            <span className={`rounded-full px-2 py-0.5 text-xs ${color(l.action)}`}>{l.action}</span>
            <span className="text-white">{l.actor}</span>
            <span className="text-slate-400">{l.target}</span>
            {l.detail && <span className="text-slate-500">· {l.detail}</span>}
            <span className="ml-auto text-slate-500">{new Date(l.at).toLocaleString("zh-CN")}</span>
            <span className="text-slate-600">{l.ip}</span>
          </li>
        ))}
        {logs.length === 0 && (
          <li className="p-4 text-center text-slate-500">暂无审计记录</li>
        )}
      </ul>
    </div>
  );
}

/* ---------------- 账号安全（修改密码） ---------------- */
function SecuritySettings({ username }: { username: string }) {
  const [oldPassword, setOld] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    if (newPassword !== confirm) {
      setMsg("两次输入的新密码不一致");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "修改失败");
      setMsg("密码已更新 ✅ 请妥善保管");
      setOld(""); setNew(""); setConfirm("");
    } catch (e: any) {
      setMsg(e.message || "修改失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass max-w-md p-6">
      <h3 className="text-lg font-semibold text-white">账号安全</h3>
      <p className="mt-1 text-sm text-slate-400">当前账号：{username} · 建议定期更换密码。</p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <input type="password" value={oldPassword} onChange={(e) => setOld(e.target.value)} placeholder="原密码" className="input-base" required />
        <input type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} placeholder="新密码（至少 8 位）" className="input-base" required minLength={8} />
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="确认新密码" className="input-base" required />
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? "提交中…" : "修改密码"}
        </button>
      </form>
      {msg && <p className="mt-3 text-sm text-emerald-400">{msg}</p>}
    </div>
  );
}

/* ---------------- 用户与角色 ---------------- */
function UsersManager() {
  const [admins, setAdmins] = useState<{ username: string; role: Role }[]>([]);

  useEffect(() => {
    fetch("/api/admins").then((r) => r.ok && r.json()).then((d) => d && setAdmins(d));
  }, []);

  return (
    <div className="space-y-6">
      <div className="glass p-6">
        <h3 className="text-lg font-semibold text-white">账号</h3>
        <ul className="mt-4 space-y-2">
          {admins.map((a) => (
            <li key={a.username} className="flex items-center gap-3 rounded-lg border border-white/10 p-3">
              <span className="text-white">{a.username}</span>
              <span className="rounded-full bg-brand-violet/20 px-3 py-1 text-xs text-brand-violet">
                {ROLE_LABELS[a.role]}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="glass p-6">
        <h3 className="text-lg font-semibold text-white">RBAC 权限矩阵</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-400">
              <tr>
                <th className="p-2">权限 \ 角色</th>
                {Object.keys(ROLE_LABELS).map((r) => (
                  <th key={r} className="p-2">{ROLE_LABELS[r as Role]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERM_ORDER.map((p) => (
                <tr key={p} className="border-t border-white/10">
                  <td className="p-2 text-slate-300">{PERMISSION_LABELS[p]}</td>
                  {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                    <td key={r} className="p-2 text-center">
                      {can(r, p) ? (
                        <span className="text-emerald-400">✓</span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          账号与权限的增删改请在服务端数据存储（data/db.json）或接入身份服务后扩展。
        </p>
      </div>
    </div>
  );
}

/* ==================== 知识库管理 ==================== */

const KB_ACCEPT = ".docx,.doc,.xlsx,.xls,.csv,.pdf,.txt,.md";

function KbManager() {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/kb", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "加载失败");
      setDocs(Array.isArray(data) ? data : []);
      setErr("");
    } catch (e: any) {
      setErr(e.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(file: File) {
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/kb", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "导入失败");
      setMsg(`《${file.name}》导入成功，提取 ${data.chars} 字，客服已可引用`);
      await load();
    } catch (e: any) {
      setErr(e.message || "导入失败");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(id: string, title: string) {
    if (!confirm(`确定删除《${title}》？客服将不再引用该文档。`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/kb?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "删除失败");
      setMsg(`已删除《${title}》`);
      await load();
    } catch (e: any) {
      setErr(e.message || "删除失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="glass p-6">
        <h2 className="text-sm font-semibold text-white">导入知识库文档</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          支持 Word（.docx/.doc）、Excel（.xlsx/.xls/.csv）、PDF（文字版）、TXT、Markdown，单个 ≤ 10MB。
          导入后智能客服会依据文档内容回答访客提问（答案标注来源文档）。
        </p>
        <input
          ref={fileRef}
          type="file"
          accept={KB_ACCEPT}
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
          }}
          className="mt-4 block w-full cursor-pointer rounded-lg border border-white/15 bg-slate-900/80 px-3 py-2.5 text-sm text-slate-300 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-brand-blue/80 file:px-3 file:py-1.5 file:text-white hover:border-brand-cyan/50"
        />
        {busy && <p className="mt-3 text-xs text-brand-cyan">正在解析文档…（大文件可能需要十几秒）</p>}
        {msg && <p className="mt-3 text-xs text-emerald-400">{msg}</p>}
        {err && <p className="mt-3 text-xs text-red-400">{err}</p>}
      </div>

      <div className="glass p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">已导入文档（{docs.length}）</h2>
          <button onClick={load} className="text-xs text-slate-400 hover:text-white">刷新</button>
        </div>
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">加载中…</p>
        ) : docs.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">还没有导入文档。上传第一份产品手册或 FAQ，客服立刻变得更专业。</p>
        ) : (
          <ul className="mt-4 divide-y divide-white/5">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{iconForExt(d.ext)}</span>
                    <span className="truncate text-sm font-medium text-slate-200">{d.title}</span>
                    <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-xs uppercase text-slate-400">
                      {d.ext}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {d.chars} 字 · 导入于 {d.at} · 摘要：{d.summary}
                  </p>
                </div>
                <button
                  onClick={() => remove(d.id, d.title)}
                  disabled={busy}
                  className="shrink-0 rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-400 transition hover:bg-red-500/10 disabled:opacity-40"
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function iconForExt(ext: string): string {
  const m: Record<string, string> = {
    docx: "📝", doc: "📝", xlsx: "📊", xls: "📊", csv: "📊", pdf: "📕", txt: "📄", md: "📄",
  };
  return m[ext] || "📄";
}
