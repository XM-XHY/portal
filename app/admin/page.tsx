"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ROLE_LABELS,
  PERMISSION_LABELS,
  ROLE_PERMISSIONS,
  can,
  type Role,
  type Permission,
} from "@/lib/auth";
import ScheduleManager from "@/components/ScheduleManager";

type Me = { username: string; role: Role; perms?: string[]; mustChangePassword?: boolean } | null;

const PERM_ORDER: Permission[] = [
  "content.manage",
  "leads.view",
  "leads.export",
  "search.logs",
  "audit.view",
  "users.manage",
  "settings.manage",
  "schedule.manage",
  "order.manage",
  "balance.manage",
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
        setMe({ username: data.username, role: data.role, perms: data.perms, mustChangePassword: !!data.mustChangePassword });
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
    { key: "products", label: "产品中心", perm: "content.manage" },
    { key: "schedule", label: "排课系统", perm: "schedule.manage" },
    { key: "pay", label: "产品付费", perm: "settings.manage" },
    { key: "orders", label: "订单管理", perm: "order.manage" },
    { key: "content", label: "内容管理", perm: "content.manage" },
    { key: "kb", label: "知识库", perm: "content.manage" },
    { key: "leads", label: "线索管理", perm: "leads.view" },
    { key: "logs", label: "获客日志", perm: "search.logs" },
    { key: "audit", label: "操作审计", perm: "audit.view" },
    { key: "users", label: "用户与角色", perm: "users.manage" },
  ];
  const managedTabs = allTabs.filter((t) => can(me, t.perm));

  const tabs = [...managedTabs, { key: "security", label: "账号安全", perm: "settings.manage" as Permission }];
  const active = tab || tabs[0]?.key;

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#06080f]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <span className="font-semibold">管理后台</span>
          <div className="flex items-center gap-3 text-sm">
            {can(me, "search.logs") && (
              <Link
                href="/dashboard"
                target="_blank"
                rel="noreferrer"
                className="text-slate-400 hover:text-white"
              >
                数据看板 ↗
              </Link>
            )}
            {can(me, "users.manage") && (
              <Link
                href="/admin/teacher-sub"
                className="text-slate-400 hover:text-white"
              >
                教师工作台订阅
              </Link>
            )}
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
        {me.mustChangePassword && (
          <button
            onClick={() => setTab("security")}
            className="mb-5 w-full rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-left text-sm text-amber-200 hover:bg-amber-500/20"
          >
            ⚠️ 当前账号仍在使用初始口令，存在被猜测风险。点此前往「账号安全」立即修改 →
          </button>
        )}
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
          {active === "products" && <ProductCenterManager />}
          {active === "schedule" && <ScheduleManager />}
          {active === "pay" && <PayConfigManager />}
          {active === "orders" && <OrdersManager />}
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
        <p className="mt-2 text-center text-sm text-slate-400">企业门户管理平台</p>
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
          请使用管理员分配的账号登录；连续输错会被临时锁定。
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">
          <Link href="/register" className="text-brand-cyan hover:underline">教师自助注册</Link>
          {" · "}
          <Link href="/" className="text-brand-cyan hover:underline">返回官网</Link>
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

/* ==================== 产品中心（产品 / 解决方案 · 资料导入 · 展示排序） ==================== */

type PDocLite = {
  id: string;
  title: string;
  ext: string;
  chars: number;
  at: string;
  summary: string;
};

type PItem = {
  id: string;
  type: "product" | "solution";
  title: string;
  tag: string;
  summary: string;
  body: string;
  icon: string;
  tags: string[];
  industry: string;
  result: string;
  at: string;
  order: number;
  docs: PDocLite[];
};

type PForm = {
  id: string;
  type: "product" | "solution";
  title: string;
  tag: string;
  icon: string;
  summary: string;
  body: string;
  tags: string;
  industry: string;
  result: string;
};

const EMPTY_PFORM: PForm = {
  id: "",
  type: "product",
  title: "",
  tag: "",
  icon: "📦",
  summary: "",
  body: "",
  tags: "",
  industry: "",
  result: "",
};

const PDOC_ACCEPT = ".docx,.doc,.xlsx,.xls,.csv,.pdf,.txt,.md";

function ProductCenterManager() {
  const [items, setItems] = useState<PItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [form, setForm] = useState<PForm>(EMPTY_PFORM);
  const [activeId, setActiveId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [alsoKb, setAlsoKb] = useState(true);
  const [dragId, setDragId] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/products", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "加载失败");
      setItems(Array.isArray(data.items) ? data.items : []);
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

  const active = useMemo(() => items.find((i) => i.id === activeId) || null, [items, activeId]);

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(""), 4000);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      setErr("名称必填");
      return;
    }
    setErr("");
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "保存失败");
      const editing = !!form.id;
      setForm(EMPTY_PFORM);
      flash(editing ? "已保存修改 ✅" : "已新增，排在列表末尾 ✅");
      await load();
    } catch (e: any) {
      setErr(e.message || "保存失败");
    }
  }

  async function remove(id: string, title: string) {
    if (!confirm(`确定删除「${title}」？该产品下的资料文档会一并删除。`)) return;
    try {
      const res = await fetch(`/api/products?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "删除失败");
      if (activeId === id) setActiveId("");
      flash("已删除");
      await load();
    } catch (e: any) {
      setErr(e.message || "删除失败");
    }
  }

  /** 保存新的展示顺序（先本地更新，再落库；失败自动回滚并重新拉取） */
  async function persistOrder(next: PItem[]) {
    const prev = items;
    setItems(next);
    try {
      const res = await fetch("/api/products/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: next.map((i) => i.id) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "排序保存失败");
    } catch (e: any) {
      setItems(prev);
      setErr(e.message || "排序保存失败");
    }
  }

  function moveBy(id: string, delta: number) {
    const idx = items.findIndex((i) => i.id === id);
    const target = idx + delta;
    if (idx < 0 || target < 0 || target >= items.length) return;
    const next = [...items];
    [next[idx], next[target]] = [next[target], next[idx]];
    persistOrder(next);
  }

  function moveTo(fromId: string, toId: string) {
    if (!fromId || fromId === toId) return;
    const from = items.findIndex((i) => i.id === fromId);
    const to = items.findIndex((i) => i.id === toId);
    if (from < 0 || to < 0) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    persistOrder(next);
    setDragId("");
  }

  async function upload(file: File) {
    if (!activeId) return;
    setUploading(true);
    setErr("");
    try {
      const fd = new FormData();
      fd.append("productId", activeId);
      fd.append("file", file);
      fd.append("title", file.name);
      if (alsoKb) fd.append("alsoKb", "1");
      const res = await fetch("/api/products/doc", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "导入失败");
      flash(
        `《${file.name}》导入成功，提取 ${data.chars} 字${data.kb ? "，已同步客服知识库" : ""}`
      );
      await load();
    } catch (e: any) {
      setErr(e.message || "导入失败");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeDoc(id: string, title: string) {
    if (!confirm(`确定删除资料《${title}》？`)) return;
    try {
      const res = await fetch(`/api/products/doc?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "删除失败");
      flash("资料已删除");
      await load();
    } catch (e: any) {
      setErr(e.message || "删除失败");
    }
  }

  function editItem(i: PItem) {
    setForm({
      id: i.id,
      type: i.type,
      title: i.title,
      tag: i.tag,
      icon: i.icon || "📦",
      summary: i.summary,
      body: i.body || "",
      tags: (i.tags || []).join("，"),
      industry: i.industry || "",
      result: i.result || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const set = (k: keyof PForm, v: string) => setForm({ ...form, [k]: v });

  return (
    <div className="space-y-6">
      {/* 新增 / 编辑 */}
      <div className="glass p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-white">
            {form.id ? "编辑条目" : "新增产品或解决方案"}
          </h3>
          {form.id && (
            <button
              type="button"
              onClick={() => setForm(EMPTY_PFORM)}
              className="text-xs text-slate-400 hover:text-white"
            >
              取消编辑
            </button>
          )}
        </div>
        <form onSubmit={save} className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            {(["product", "solution"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set("type", t)}
                className={`rounded-full px-3 py-1 text-xs ${
                  form.type === t ? "bg-white/20 text-white" : "bg-white/5 text-slate-300"
                }`}
              >
                {t === "product" ? "产品" : "解决方案"}
              </button>
            ))}
          </div>

          <input
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="名称（必填），如：智能客服 Copilot"
            className="input-base sm:col-span-2"
            required
          />
          <input
            value={form.tag}
            onChange={(e) => set("tag", e.target.value)}
            placeholder="分类，如：智能客服 / 金融"
            className="input-base"
          />
          <input
            value={form.icon}
            onChange={(e) => set("icon", e.target.value)}
            placeholder="图标 Emoji，如 💬"
            className="input-base"
          />
          <input
            value={form.industry}
            onChange={(e) => set("industry", e.target.value)}
            placeholder="适用场景，如：金融/政务/医疗等强合规行业"
            className="input-base sm:col-span-2"
          />
          <input
            value={form.result}
            onChange={(e) => set("result", e.target.value)}
            placeholder="成效亮点，如：响应时长 -70%"
            className="input-base sm:col-span-2"
          />
          <input
            value={form.tags}
            onChange={(e) => set("tags", e.target.value)}
            placeholder="核心能力（逗号分隔，如：大模型，知识库RAG）"
            className="input-base sm:col-span-2"
          />
          <textarea
            value={form.summary}
            onChange={(e) => set("summary", e.target.value)}
            placeholder="摘要（卡片上展示的一句话）"
            rows={2}
            className="input-base resize-none sm:col-span-2"
          />
          <textarea
            value={form.body}
            onChange={(e) => set("body", e.target.value)}
            placeholder="详情正文（详情页展示，支持换行分段）"
            rows={4}
            className="input-base resize-none sm:col-span-2"
          />

          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary">
              {form.id ? "保存修改" : "新增"}
            </button>
          </div>
        </form>
        {msg && <p className="mt-3 text-xs text-emerald-400">{msg}</p>}
        {err && <p className="mt-3 text-xs text-red-400">{err}</p>}
      </div>

      {/* 列表与排序 */}
      <div className="glass p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-white">
            展示顺序（{items.length} 项）
          </h3>
          <button onClick={load} className="text-xs text-slate-400 hover:text-white">
            刷新
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          拖动左侧手柄或使用 ↑ ↓ 调整展示位置，顺序即时保存，前台「产品中心」按此顺序展示。
        </p>

        {loading ? (
          <p className="mt-4 text-sm text-slate-500">加载中…</p>
        ) : items.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            还没有产品或解决方案。用上方表单添加第一个，例如「智能客服 Copilot」。
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {items.map((i, idx) => (
              <li
                key={i.id}
                draggable
                onDragStart={() => setDragId(i.id)}
                onDragEnd={() => setDragId("")}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  moveTo(dragId, i.id);
                }}
                className={`flex flex-wrap items-center gap-2 rounded-xl border p-3 ${
                  activeId === i.id
                    ? "border-brand-cyan/50 bg-brand-cyan/5"
                    : "border-white/10"
                } ${dragId === i.id ? "opacity-50" : ""}`}
              >
                <span className="cursor-grab select-none text-slate-500" title="按住拖动排序">
                  ⠿
                </span>
                <span className="w-5 text-center text-xs text-slate-500">{idx + 1}</span>
                <span className="text-xl">{i.icon || "📦"}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        i.type === "solution"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-brand-violet/20 text-brand-violet"
                      }`}
                    >
                      {i.type === "solution" ? "解决方案" : "产品"}
                    </span>
                    <span className="truncate text-sm font-medium text-slate-100">{i.title}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {i.tag || "未分类"}
                    {i.result ? ` · ${i.result}` : ""} · 资料 {i.docs.length} 份
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1">
                  <button
                    onClick={() => moveBy(i.id, -1)}
                    disabled={idx === 0}
                    title="上移"
                    className="rounded-lg border border-white/15 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveBy(i.id, 1)}
                    disabled={idx === items.length - 1}
                    title="下移"
                    className="rounded-lg border border-white/15 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => setActiveId(i.id)}
                    className={`rounded-lg border px-2 py-1 text-xs ${
                      activeId === i.id
                        ? "border-brand-cyan/50 text-brand-cyan"
                        : "border-white/15 hover:bg-white/10"
                    }`}
                  >
                    资料
                  </button>
                  <button
                    onClick={() => editItem(i)}
                    className="rounded-lg border border-white/15 px-2 py-1 text-xs hover:bg-white/10"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => remove(i.id, i.title)}
                    className="rounded-lg border border-red-500/30 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10"
                  >
                    删除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 资料导入 */}
      <div className="glass p-6">
        <h3 className="text-lg font-semibold text-white">
          产品资料管理{active ? `：${active.title}` : ""}
        </h3>
        {!active ? (
          <p className="mt-3 text-sm text-slate-500">
            在上方列表点击某个条目的「资料」按钮，即可为它导入文档。
          </p>
        ) : (
          <>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              支持 Word（.docx/.doc）、Excel（.xlsx/.xls/.csv）、PDF（文字版）、TXT、Markdown，单个 ≤
              10MB。导入后可在前台该产品详情页「在线阅读 / 下载文本版」。
            </p>
            <label className="mt-3 flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={alsoKb}
                onChange={(e) => setAlsoKb(e.target.checked)}
                className="h-4 w-4 accent-brand-cyan"
              />
              同时纳入智能客服知识库（客服回答时可引用该资料）
            </label>
            <input
              ref={fileRef}
              type="file"
              accept={PDOC_ACCEPT}
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
              }}
              className="mt-3 block w-full cursor-pointer rounded-lg border border-white/15 bg-slate-900/80 px-3 py-2.5 text-sm text-slate-300 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-brand-blue/80 file:px-3 file:py-1.5 file:text-white hover:border-brand-cyan/50 disabled:opacity-50"
            />
            {uploading && <p className="mt-3 text-xs text-brand-cyan">正在解析文档…</p>}

            <div className="mt-4">
              {active.docs.length === 0 ? (
                <p className="text-sm text-slate-500">该产品还没有资料文档。</p>
              ) : (
                <ul className="divide-y divide-white/5">
                  {active.docs.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{iconForExt(d.ext)}</span>
                          <span className="truncate text-sm font-medium text-slate-200">
                            {d.title}
                          </span>
                          <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-xs uppercase text-slate-400">
                            {d.ext}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {d.chars} 字 · {d.at}
                          {d.summary ? ` · 摘要：${d.summary}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <a
                          href={`/api/products/doc/${d.id}?mode=view`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10"
                        >
                          预览
                        </a>
                        <button
                          onClick={() => removeDoc(d.id, d.title)}
                          className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
                        >
                          删除
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------- 内容管理（资讯 / 产品 / 解决方案 / 案例，卡片化 + 类型筛选） ---------------- */
const TYPE_TABS: { key: "" | "news" | "product" | "solution" | "case"; label: string }[] = [
  { key: "", label: "全部" },
  { key: "news", label: "资讯" },
  { key: "product", label: "产品" },
  { key: "solution", label: "解决方案" },
  { key: "case", label: "案例" },
];
const TYPE_BADGE: Record<string, string> = {
  news: "bg-brand-blue/20 text-brand-blue",
  product: "bg-brand-violet/20 text-brand-violet",
  solution: "bg-emerald-500/20 text-emerald-300",
  case: "bg-brand-cyan/20 text-brand-cyan",
};
const TYPE_LABEL: Record<string, string> = {
  news: "资讯",
  product: "产品",
  solution: "解决方案",
  case: "案例",
};

type CForm = {
  id: string;
  type: "news" | "product" | "solution" | "case";
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
  const [typeFilter, setTypeFilter] = useState<"" | "news" | "product" | "solution" | "case">("");
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
            {(["news", "product", "solution", "case"] as const).map((t) => (
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

          {(form.type === "product" || form.type === "solution") && (
            <input value={form.icon} onChange={(e) => set("icon", e.target.value)} placeholder="图标 Emoji，如 💬" className="input-base" />
          )}
          {(form.type === "product" || form.type === "solution") && (
            <input value={form.industry} onChange={(e) => set("industry", e.target.value)} placeholder="适用场景，如：金融/政务等强合规行业" className="input-base" />
          )}
          {(form.type === "product" || form.type === "solution" || form.type === "case") && (
            <input value={form.result} onChange={(e) => set("result", e.target.value)} placeholder="成效指标，如：成本 -35%" className="input-base sm:col-span-2" />
          )}
          {form.type === "case" && (
            <>
              <input value={form.client} onChange={(e) => set("client", e.target.value)} placeholder="客户名称" className="input-base" />
              <input value={form.industry} onChange={(e) => set("industry", e.target.value)} placeholder="所属行业" className="input-base" />
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

/* ---------------- 员工账号（企业知识中枢 /hub 登录账号） ---------------- */
function EmployeesPanel() {
  const [items, setItems] = useState<{ id: string; username: string }[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admins/employees", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setItems(Array.isArray(data) ? data : []);
      else setErr(data.error || "加载失败");
    } catch {
      setErr("加载失败");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const res = await fetch("/api/admins/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "创建失败");
      setMsg(`员工「${username}」已开通，可登录 /hub 使用企业知识中枢`);
      setUsername("");
      setPassword("");
      await load();
    } catch (e: any) {
      setErr(e.message || "创建失败");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(id: string, name: string) {
    const pw = prompt(`为「${name}」设置新密码（至少 8 位）：`) || "";
    if (!pw) return;
    if (pw.length < 8) {
      alert("密码至少 8 位");
      return;
    }
    const res = await fetch("/api/admins/employees", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, password: pw }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setMsg(`已重置「${name}」的密码`);
    else setErr(data.error || "重置失败");
    load();
  }

  async function remove(id: string, name: string) {
    if (!confirm(`确定删除员工账号「${name}」？该账号将无法登录知识中枢。`)) return;
    const res = await fetch(`/api/admins/employees?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setMsg(`已删除「${name}」`);
    else setErr(data.error || "删除失败");
    load();
  }

  return (
    <div className="glass p-6">
      <h3 className="text-lg font-semibold text-white">员工账号（企业知识中枢）</h3>
      <p className="mt-1 text-sm text-slate-400">
        员工账号仅用于登录 <code className="text-brand-cyan">/hub</code>{" "}
        检索知识库材料与生成文档，不拥有任何后台管理权限。
      </p>

      <form onSubmit={add} className="mt-4 flex flex-wrap gap-2">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="账号（字母/数字，2-40 位）"
          className="input-base max-w-[14rem] flex-1"
          required
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="初始密码（至少 8 位）"
          className="input-base max-w-[14rem] flex-1"
          minLength={8}
          required
        />
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? "开通中…" : "+ 开通账号"}
        </button>
      </form>

      {msg && <p className="mt-3 text-xs text-emerald-400">{msg}</p>}
      {err && <p className="mt-3 text-xs text-red-400">{err}</p>}

      <ul className="mt-4 space-y-2">
        {items.map((a) => (
          <li
            key={a.id}
            className="flex items-center gap-3 rounded-lg border border-white/10 p-3 text-sm"
          >
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/5 text-base">👤</span>
            <span className="text-white">{a.username}</span>
            <div className="ml-auto flex gap-2">
              <button
                onClick={() => resetPassword(a.id, a.username)}
                className="rounded-lg border border-white/15 px-2 py-1 text-xs hover:bg-white/10"
              >
                重置密码
              </button>
              <button
                onClick={() => remove(a.id, a.username)}
                className="rounded-lg border border-red-500/30 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10"
              >
                删除
              </button>
            </div>
          </li>
        ))}
        {items.length === 0 && (
          <li className="rounded-lg border border-white/10 p-4 text-center text-sm text-slate-500">
            还没有员工账号。用上方表单开通第一个，员工即可登录 /hub。
          </li>
        )}
      </ul>
    </div>
  );
}

/* ---------------- 用户与角色 ---------------- */
type AdminRow = { id: string; username: string; role: Role; mustChangePassword?: boolean; perms?: string[] };

function UsersManager() {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [form, setForm] = useState({ username: "", password: "", role: "viewer" as Role });
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admins", { cache: "no-store" });
      const d = await r.json();
      if (r.ok) setAdmins(Array.isArray(d) ? d : []);
      else setErr(d.error || "加载账号失败");
    } catch (e: any) {
      setErr(e.message || "加载账号失败");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function call(url: string, init: RequestInit, okText: string) {
    setBusy(true); setMsg(""); setErr("");
    try {
      const r = await fetch(url, init);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "操作失败");
      setMsg(okText);
      await load();
    } catch (e: any) {
      setErr(e.message || "操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await call("/api/admins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    }, "账号已创建");
    setForm({ username: "", password: "", role: "viewer" });
  }

  function changeRole(a: AdminRow, role: Role) {
    if (role === a.role) return;
    if (!confirm(`确定把「${a.username}」的角色改为「${ROLE_LABELS[role]}」？`)) { load(); return; }
    void call("/api/admins", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: a.id, role }),
    }, "角色已更新");
  }

  function resetPassword(a: AdminRow) {
    const pw = window.prompt(`为「${a.username}」设置新密码（8-128 位，含字母与数字）：`);
    if (!pw) return;
    void call("/api/admins", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: a.id, password: pw }),
    }, "密码已重置");
  }

  function remove(a: AdminRow) {
    if (!confirm(`确定删除账号「${a.username}」？该账号将立即无法登录。`)) return;
    void call(`/api/admins?id=${encodeURIComponent(a.id)}`, { method: "DELETE" }, "账号已删除");
  }

  return (
    <div className="space-y-6">
      <div className="glass p-6">
        <h3 className="text-lg font-semibold text-white">后台账号</h3>
        <p className="mt-1 text-xs text-slate-400">
          可新增账号、调整角色、重置他人密码、删除账号。最后一个超级管理员不可降级或删除。
        </p>
        <div className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
          教师可自助注册账号（默认仅「分班查询码管理」）：
          <Link href="/register" className="ml-1 text-brand-cyan hover:underline" target="_blank" rel="noreferrer">
            /register（公开页面）
          </Link>
        </div>

        <form onSubmit={create} className="mt-4 flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-400">账号
            <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="2-40 位字母数字" className="input-base mt-1 w-44" required />
          </label>
          <label className="text-xs text-slate-400">初始密码
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="至少 8 位，含字母数字" className="input-base mt-1 w-48" required minLength={8} />
          </label>
          <label className="text-xs text-slate-400">角色
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
              className="input-base mt-1 w-36">
              {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={busy} className="btn-primary disabled:opacity-50">新增账号</button>
        </form>

        {msg && <p className="mt-3 text-sm text-emerald-400">{msg}</p>}
        {err && <p className="mt-3 text-sm text-red-400">{err}</p>}

        <ul className="mt-4 space-y-2">
          {admins.filter((a) => a.role !== "employee").map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 p-3">
              <span className="min-w-24 text-white">{a.username}</span>
              {a.mustChangePassword && (
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">仍在使用初始口令</span>
              )}
              <select value={a.role} disabled={busy} onChange={(e) => changeRole(a, e.target.value as Role)}
                className="input-base w-36 py-1 text-xs">
                {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
              <span className="ml-auto flex gap-2">
                <button onClick={() => resetPassword(a)} disabled={busy}
                  className="rounded-lg border border-white/15 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/10 disabled:opacity-50">
                  重置密码
                </button>
                <button onClick={() => remove(a)} disabled={busy}
                  className="rounded-lg border border-rose-400/40 px-2.5 py-1 text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-50">
                  删除
                </button>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <EmployeesPanel />

      <PermManager admins={admins} reload={load} />

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
          角色权限由 lib/auth.ts 定义；账号数据保存在服务端存储，换设备登录不受影响。
        </p>
      </div>
    </div>
  );
}

/* ==================== 逐账号权限分配 ==================== */

function PermManager({ admins, reload }: { admins: AdminRow[]; reload: () => void }) {
  const [edits, setEdits] = useState<Record<string, string[]>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  function effective(a: AdminRow): string[] {
    const base = a.perms ?? ROLE_PERMISSIONS[a.role];
    const ov = edits[a.id];
    return ov ? ov : base;
  }

  function toggle(a: AdminRow, p: Permission) {
    const cur = effective(a);
    const next = cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p];
    setEdits((e) => ({ ...e, [a.id]: next }));
  }

  async function save(a: AdminRow) {
    setBusyId(a.id);
    setMsg("");
    setErr("");
    const chosen = edits[a.id] ?? a.perms ?? ROLE_PERMISSIONS[a.role];
    const roleDefault = ROLE_PERMISSIONS[a.role];
    const sameAsDefault =
      chosen.length === roleDefault.length && roleDefault.every((p) => chosen.includes(p));
    const body = sameAsDefault ? { id: a.id, perms: null } : { id: a.id, perms: chosen };
    try {
      const r = await fetch("/api/admins", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "保存失败");
      setMsg(`已保存「${a.username}」的权限`);
      setEdits((e) => {
        const n = { ...e };
        delete n[a.id];
        return n;
      });
      await reload();
    } catch (e: any) {
      setErr(e.message || "保存失败");
    } finally {
      setBusyId(null);
    }
  }

  async function restore(a: AdminRow) {
    setBusyId(a.id);
    setMsg("");
    setErr("");
    try {
      const r = await fetch("/api/admins", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: a.id, perms: null }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "恢复失败");
      setMsg(`已恢复「${a.username}」为角色默认权限`);
      setEdits((e) => {
        const n = { ...e };
        delete n[a.id];
        return n;
      });
      await reload();
    } catch (e: any) {
      setErr(e.message || "恢复失败");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="glass p-6">
      <h3 className="text-lg font-semibold text-white">逐账号权限分配</h3>
      <p className="mt-1 text-xs text-slate-400">
        在角色默认权限之外，可逐账号勾选覆盖。保存后该账号以勾选项为准；「恢复默认」清除覆盖、回退角色权限。
      </p>
      {msg && <p className="mt-3 text-sm text-emerald-400">{msg}</p>}
      {err && <p className="mt-3 text-sm text-red-400">{err}</p>}
      <div className="mt-4 space-y-4">
        {admins.map((a) => {
          const eff = effective(a);
          const changed = edits[a.id] !== undefined;
          return (
            <div key={a.id} className="rounded-lg border border-white/10 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="min-w-24 text-white">{a.username}</span>
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-slate-300">
                  {ROLE_LABELS[a.role]}
                </span>
                {a.perms && !changed && (
                  <span className="rounded-full bg-brand-violet/20 px-2 py-0.5 text-xs text-brand-violet">
                    已自定义
                  </span>
                )}
                {changed && (
                  <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">
                    未保存
                  </span>
                )}
                <span className="ml-auto flex gap-2">
                  <button
                    onClick={() => save(a)}
                    disabled={busyId === a.id}
                    className="rounded-lg border border-white/15 px-2.5 py-1 text-xs text-slate-200 hover:bg-white/10 disabled:opacity-50"
                  >
                    保存
                  </button>
                  <button
                    onClick={() => restore(a)}
                    disabled={busyId === a.id}
                    className="rounded-lg border border-white/15 px-2.5 py-1 text-xs text-slate-400 hover:bg-white/10 disabled:opacity-50"
                  >
                    恢复默认
                  </button>
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
                {PERM_ORDER.map((p) => (
                  <label key={p} className="flex items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={eff.includes(p)}
                      onChange={() => toggle(a, p)}
                      className="h-4 w-4 rounded border-white/20 bg-white/5 accent-brand-violet"
                    />
                    {PERMISSION_LABELS[p]}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
        {admins.length === 0 && <p className="text-sm text-slate-500">暂无可分配的账号。</p>}
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

/* ==================== 产品付费（收款二维码 + 各产品下载付费金额） ==================== */

/* ---------------- 订单管理（查单 / 退款 / 导出 CSV） ---------------- */
type OrderRow = {
  id: string;
  productId: string;
  productTitle: string;
  amount: number;
  provider: string;
  status: string;
  codeUrl?: string;
  tradeNo?: string;
  createdAt: string;
  paidAt?: string;
  expiresAt?: string;
  client?: string;
  refunds?: { refundNo: string; status: string; amount: number; reason?: string; at: string; gatewayRefundId?: string }[];
  refundedAmount?: number;
};

const ORDER_STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  pending: { text: "待支付", cls: "bg-amber-500/20 text-amber-300" },
  paid: { text: "已支付", cls: "bg-emerald-500/20 text-emerald-300" },
  expired: { text: "已超时", cls: "bg-slate-500/20 text-slate-400" },
  refunding: { text: "部分退款", cls: "bg-orange-500/20 text-orange-300" },
  refunded: { text: "已退款", cls: "bg-rose-500/20 text-rose-300" },
};

function OrdersManager() {
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [stat, setStat] = useState<any>({});
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [busyId, setBusyId] = useState("");
  const [refundFor, setRefundFor] = useState<OrderRow | null>(null);
  const [refundAmount, setRefundAmount] = useState<string>("");
  const [refundReason, setRefundReason] = useState("");

  const load = useCallback((overrideQ?: string, overrideStatus?: string) => {
    setLoading(true);
    setErr("");
    const qs = new URLSearchParams();
    const query = overrideQ ?? q;
    const st = overrideStatus ?? status;
    if (query) qs.set("q", query);
    if (st && st !== "all") qs.set("status", st);
    fetch(`/api/admin/orders?${qs.toString()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setErr(d.error); setRows([]); return; }
        setRows(d.orders || []);
        setStat(d.stat || {});
      })
      .catch(() => setErr("加载失败"))
      .finally(() => setLoading(false));
  }, [q, status]);

  useEffect(() => { load(); }, [load]);

  async function syncOne(o: OrderRow) {
    setBusyId(o.id);
    setNote("");
    setErr("");
    try {
      const r = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: o.id }),
      });
      const d = await r.json();
      if (d.error) setErr(d.error);
      else setNote(`${o.id}：${d.note || "已同步"}`);
      load();
    } finally {
      setBusyId("");
    }
  }

  /** 同步退款状态：退款回调丢失或状态仍为处理中时，向微信主动查询并回写 */
  async function syncRefund(o: OrderRow) {
    setBusyId(o.id);
    setNote("");
    setErr("");
    try {
      const r = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: o.id, action: "sync-refund" }),
      });
      const d = await r.json();
      if (d.error) setErr(d.error);
      else setNote(`${o.id}：${d.note || "已同步退款状态"}`);
      load();
    } finally {
      setBusyId("");
    }
  }

  async function doRefund() {
    if (!refundFor) return;
    setBusyId(refundFor.id);
    setErr("");
    setNote("");
    try {
      const r = await fetch("/api/admin/orders/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: refundFor.id,
          amount: refundAmount === "" ? undefined : Number(refundAmount),
          reason: refundReason || "管理员后台退款",
        }),
      });
      const d = await r.json();
      if (d.error) {
        setErr(d.error);
      } else {
        setNote(`退款已受理：¥${d.refund?.amount}（状态 ${d.refund?.status}）`);
        setRefundFor(null);
        setRefundAmount("");
        setRefundReason("");
        load();
      }
    } finally {
      setBusyId("");
    }
  }

  function exportCsv() {
    const head = ["订单号", "商品", "金额(元)", "状态", "支付通道", "微信流水号", "下单时间", "支付时间", "已退金额", "退款单号"];
    const lines = rows.map((o) => [
      o.id,
      o.productTitle,
      o.amount,
      ORDER_STATUS_LABEL[o.status]?.text || o.status,
      o.provider,
      o.tradeNo || "",
      fmt(o.createdAt),
      o.paidAt ? fmt(o.paidAt) : "",
      o.refundedAmount || 0,
      (o.refunds || []).map((r) => `${r.refundNo}(${r.status})`).join(" "),
    ]);
    const csv = [head, ...lines]
      .map((cols) => cols.map((c) => {
        const s = String(c ?? "");
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(","))
      .join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `订单_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const statCards = [
    { label: "订单总数", value: `${stat.total ?? 0} 笔` },
    { label: "已支付", value: `${stat.paidCount ?? 0} 笔 / ¥${stat.paidAmount ?? 0}` },
    { label: "待支付", value: `${stat.pendingCount ?? 0} 笔` },
    { label: "累计退款", value: `¥${stat.refundedAmount ?? 0}` },
  ];

  return (
    <div className="glass p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-white">订单管理</h3>
        <div className="flex gap-2">
          <button onClick={() => load()} className="btn-ghost py-2 text-sm">刷新</button>
          <button onClick={exportCsv} disabled={!rows.length} className="btn-ghost py-2 text-sm disabled:opacity-50">
            导出 CSV
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        {statCards.map((c) => (
          <div key={c.label} className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-xs text-slate-400">{c.label}</div>
            <div className="mt-1 text-lg font-semibold text-white">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="搜索订单号 / 商品 / 流水号"
          className="input-base max-w-xs flex-1"
        />
        <select
          value={status}
          onChange={(e) => { const v = e.target.value; setStatus(v); load(undefined, v); }}
          className="input-base max-w-[9rem]"
        >
          <option value="all">全部状态</option>
          <option value="pending">待支付</option>
          <option value="paid">已支付</option>
          <option value="refunding">部分退款</option>
          <option value="refunded">已退款</option>
          <option value="expired">已超时</option>
        </select>
        <button onClick={() => load()} className="btn-ghost py-3 text-sm">搜索</button>
      </div>

      {err && <p className="mt-3 text-sm text-red-400">{err}</p>}
      {note && <p className="mt-3 text-sm text-emerald-400">{note}</p>}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-slate-400">
            <tr>
              <th className="p-2">下单时间</th>
              <th className="p-2">订单号</th>
              <th className="p-2">商品</th>
              <th className="p-2">金额</th>
              <th className="p-2">状态</th>
              <th className="p-2">流水号</th>
              <th className="p-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const remain = Math.round((o.amount - (o.refundedAmount || 0)) * 100) / 100;
              const canRefund = o.status === "paid" || o.status === "refunding";
              return (
                <tr key={o.id} className="border-t border-white/10">
                  <td className="p-2 text-slate-400 whitespace-nowrap">{fmt(o.createdAt)}</td>
                  <td className="p-2 font-mono text-xs text-slate-300">{o.id}</td>
                  <td className="p-2 text-white">{o.productTitle}</td>
                  <td className="p-2">¥{o.amount}{o.refundedAmount ? <span className="ml-1 text-xs text-rose-300">已退¥{o.refundedAmount}</span> : null}</td>
                  <td className="p-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${ORDER_STATUS_LABEL[o.status]?.cls || "bg-slate-500/20 text-slate-300"}`}>
                      {ORDER_STATUS_LABEL[o.status]?.text || o.status}
                    </span>
                  </td>
                  <td className="p-2 font-mono text-xs text-slate-400">{o.tradeNo || "—"}</td>
                  <td className="p-2 whitespace-nowrap">
                    <div className="flex gap-2">
                      <button
                        disabled={busyId === o.id}
                        onClick={() => syncOne(o)}
                        className="rounded-lg border border-white/15 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-50"
                      >
                        查单
                      </button>
                      {canRefund && remain > 0 && (
                        <button
                          disabled={busyId === o.id}
                          onClick={() => { setRefundFor(o); setRefundAmount(String(remain)); setRefundReason(""); }}
                          className="rounded-lg border border-rose-400/40 px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                        >
                          退款
                        </button>
                      )}
                      {(o.refunds || []).length > 0 && (o.refunds || []).some((r) => r.status !== "SUCCESS") && (
                        <button
                          disabled={busyId === o.id}
                          onClick={() => syncRefund(o)}
                          title="向微信查询该订单的退款结果并更新本地状态"
                          className="rounded-lg border border-emerald-400/40 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
                        >
                          同步退款
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={7} className="p-4 text-center text-slate-500">暂无订单</td></tr>
            )}
            {loading && <tr><td colSpan={7} className="p-4 text-center text-slate-500">加载中…</td></tr>}
          </tbody>
        </table>
      </div>

      {refundFor && (
        <div className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/5 p-4">
          <h4 className="font-semibold text-white">订单退款 · {refundFor.id}</h4>
          <p className="mt-1 text-xs text-slate-400">
            商品：{refundFor.productTitle}｜订单金额 ¥{refundFor.amount}｜可退余额 ¥
            {Math.round((refundFor.amount - (refundFor.refundedAmount || 0)) * 100) / 100}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              placeholder="退款金额（元）"
              className="input-base max-w-[10rem]"
            />
            <input
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="退款原因（选填）"
              className="input-base max-w-xs flex-1"
            />
            <button onClick={doRefund} disabled={busyId === refundFor.id} className="btn-ghost py-2 text-sm disabled:opacity-50">
              确认退款
            </button>
            <button onClick={() => setRefundFor(null)} className="rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/10">
              取消
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">退款将原路退回（微信支付余额/银行卡），一般 1-3 个工作日到账。</p>
        </div>
      )}
    </div>
  );
}

function fmt(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type PayItem = { paid: boolean; amount: number };
type PayForm = { qrImageUrl: string; qrNote: string; items: Record<string, PayItem> };
type Billable = { id: string; title: string; icon: string; type: string };

function PayConfigManager() {
  const [products, setProducts] = useState<Billable[]>([]);
  const [form, setForm] = useState<PayForm>({ qrImageUrl: "", qrNote: "微信 / 支付宝 扫码支付", items: {} });
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [payStatus, setPayStatus] = useState<any>(null);
  const [check, setCheck] = useState<any>(null);
  const [checking, setChecking] = useState(false);

  const runCheck = useCallback(async () => {
    setChecking(true);
    try {
      const d = await fetch("/api/pay/selfcheck", { cache: "no-store" }).then((r) => r.json());
      setCheck(d);
    } catch (e: any) {
      setCheck({ error: e.message || "自检失败" });
    } finally {
      setChecking(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, c, st] = await Promise.all([
        fetch("/api/products", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/payconfig", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/pay/status", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      ]);
      setPayStatus(st);
      const items = (p.items || []) as Billable[];
      const list: Billable[] = [
        ...items,
        { id: "sched", title: "智能排课系统", icon: "🗓️", type: "tool" },
        { id: "balance", title: "均衡分班系统", icon: "⚖️", type: "tool" },
      ];
      setProducts(list);
      const saved = (c.items || {}) as Record<string, PayItem>;
      const merged: Record<string, PayItem> = {};
      for (const it of list) merged[it.id] = saved[it.id] || { paid: false, amount: 0 };
      setForm({
        qrImageUrl: c.qrImageUrl || "",
        qrNote: c.qrNote || "微信 / 支付宝 扫码支付",
        items: merged,
      });
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

  async function onQrFile(file: File) {
    setErr("");
    if (file.size > 800 * 1024) {
      setErr("二维码图片过大（建议 < 800KB）");
      return;
    }
    const dataUrl = await new Promise<string>((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result as string);
      fr.onerror = rej;
      fr.readAsDataURL(file);
    });
    setForm((f) => ({ ...f, qrImageUrl: dataUrl }));
  }

  function setItem(id: string, patch: Partial<PayItem>) {
    setForm((f) => ({
      ...f,
      items: { ...f.items, [id]: { ...f.items[id], ...patch } },
    }));
  }

  async function save() {
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const res = await fetch("/api/payconfig", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "保存失败");
      setMsg("已保存，前台下载将按新规则弹出收款二维码 ✅");
    } catch (e: any) {
      setErr(e.message || "保存失败");
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof PayForm, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-6">
      <div className="glass p-6">
        <h3 className="text-lg font-semibold text-white">支付通道状态</h3>
        <p className="mt-1 text-sm text-slate-400">
          真实收款由微信支付 / 支付宝商户通道完成（下单 → 用户扫码 → 网关回调确认 → 自动解锁下载）。
          商户密钥等敏感信息请在 Vercel 项目「环境变量」中配置，<b className="text-slate-200">切勿</b>在此处填写。
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <ChannelBadge label="微信支付" on={!!payStatus?.wechat} active={payStatus?.provider === "wechat"} envs={["WECHAT_PAY_MCH_ID", "WECHAT_PAY_APP_ID", "WECHAT_PAY_API_V3_KEY", "WECHAT_PAY_SERIAL", "WECHAT_PAY_PRIVATE_KEY", "WECHAT_PAY_PUBKEY_ID + WECHAT_PAY_PUBKEY（推荐）/ WECHAT_PAY_CERT"]} />
          <ChannelBadge label="支付宝" on={!!payStatus?.alipay} active={payStatus?.provider === "alipay"} envs={["ALIPAY_APP_ID", "ALIPAY_PRIVATE_KEY", "ALIPAY_PUBLIC_KEY"]} />
          <span className={`rounded-full px-3 py-1 text-sm ${payStatus?.provider ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>
            {payStatus?.provider ? `当前通道：${payStatus.provider === "wechat" ? "微信支付" : payStatus.provider === "alipay" ? "支付宝" : "模拟(mock)"}` : "当前：未配置真实通道"}
          </span>
          {payStatus?.wechatMode && (
            <span className="rounded-full bg-brand-violet/20 px-3 py-1 text-sm text-brand-violet">
              验签模式：{payStatus.wechatMode === "pubkey" ? "微信支付公钥（推荐）" : "平台证书"}
            </span>
          )}
        </div>
        {!payStatus?.provider && (
          <p className="mt-3 text-xs text-amber-400">
            提示：未配置真实通道时会降级为「自助扫码」（后台上传收款二维码）。如需真实收款，请配置 <code className="rounded bg-black/30 px-1">PAY_PROVIDER=wechat</code> 及对应商户凭据。验签凭据二选一：<code className="rounded bg-black/30 px-1">WECHAT_PAY_PUBKEY_ID + WECHAT_PAY_PUBKEY</code>（推荐，商户平台可直接复制）或 <code className="rounded bg-black/30 px-1">WECHAT_PAY_CERT</code>（平台证书）。
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button onClick={runCheck} disabled={checking} className="btn-ghost">
            {checking ? "自检中…" : "🔍 运行支付自检"}
          </button>
          <span className="text-xs text-slate-500">验证商户号 / API 私钥 / 证书序列号是否可用（仅返回结论，不返回密钥内容）</span>
        </div>
        {check && (
          <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
            <pre className="whitespace-pre-wrap break-all text-xs text-slate-300">{JSON.stringify(check, null, 2)}</pre>
          </div>
        )}
      </div>

      <div className="glass p-6">
        <h3 className="text-lg font-semibold text-white">收款二维码（自助备用）</h3>
        <p className="mt-1 text-sm text-slate-400">
          用户在前台下载需付费的资源时，会展示此二维码。上传一张微信 / 支付宝收款码图片，或粘贴图片链接。
        </p>
        <div className="mt-4 flex flex-wrap items-start gap-4">
          <div className="w-40 shrink-0">
            {form.qrImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.qrImageUrl} alt="收款二维码" className="h-40 w-40 rounded-lg border border-white/10 bg-white object-contain p-2" />
            ) : (
              <div className="flex h-40 w-40 items-center justify-center rounded-lg border border-dashed border-white/20 bg-white/5 text-xs text-slate-500">
                尚未设置二维码
              </div>
            )}
          </div>
          <div className="flex-1 space-y-3">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onQrFile(f);
              }}
              className="block w-full cursor-pointer rounded-lg border border-white/15 bg-slate-900/80 px-3 py-2.5 text-sm text-slate-300 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-brand-blue/80 file:px-3 file:py-1.5 file:text-white"
            />
            <input
              value={form.qrImageUrl}
              onChange={(e) => set("qrImageUrl", e.target.value)}
              placeholder="或粘贴二维码图片链接（https://…）"
              className="input-base"
            />
            <input
              value={form.qrNote}
              onChange={(e) => set("qrNote", e.target.value)}
              placeholder="二维码说明，如：微信 / 支付宝 扫码支付"
              className="input-base"
            />
          </div>
        </div>
      </div>

      <div className="glass p-6">
        <h3 className="text-lg font-semibold text-white">各产品下载付费</h3>
        <p className="mt-1 text-sm text-slate-400">
          开启「下载收费」并设置金额后，前台该产品（含排课系统导出）会先弹出收款二维码再允许下载。
          在「产品中心」新增产品后，这里会自动出现对应条目，只需填入金额即可。
        </p>
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">加载中…</p>
        ) : (
          <ul className="mt-4 divide-y divide-white/5">
            {products.map((p) => {
              const it = form.items[p.id] || { paid: false, amount: 0 };
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="text-xl">{p.icon || "📦"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-slate-100">{p.title}</span>
                    <span className="ml-2 rounded-full bg-white/5 px-2 py-0.5 text-xs text-slate-400">
                      {p.type === "tool" ? "独立工具" : p.type === "solution" ? "解决方案" : "产品"}
                    </span>
                  </span>
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={it.paid}
                      onChange={(e) => setItem(p.id, { paid: e.target.checked })}
                      className="h-4 w-4 accent-brand-cyan"
                    />
                    下载收费
                  </label>
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-slate-400">¥</span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      disabled={!it.paid}
                      value={it.amount}
                      onChange={(e) => setItem(p.id, { amount: Number(e.target.value) || 0 })}
                      className="input-base w-24 disabled:opacity-40"
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy} className="btn-primary">
          {busy ? "保存中…" : "保存付费设置"}
        </button>
        <button onClick={load} className="btn-ghost">刷新</button>
      </div>
      {msg && <p className="text-sm text-emerald-400">{msg}</p>}
      {err && <p className="text-sm text-red-400">{err}</p>}
    </div>
  );
}

function ChannelBadge({ label, on, active, envs }: { label: string; on: boolean; active: boolean; envs: string[] }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-sm ${active ? "bg-brand-blue/30 text-white" : on ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-slate-400"}`}
      title={`需配置：${envs.join(", ")}`}
    >
      {label}：{active ? "✅ 生效中" : on ? "已配置" : "未配置"}
    </span>
  );
}

function iconForExt(ext: string): string {
  const m: Record<string, string> = {
    docx: "📝", doc: "📝", xlsx: "📊", xls: "📊", csv: "📊", pdf: "📕", txt: "📄", md: "📄",
  };
  return m[ext] || "📄";
}
