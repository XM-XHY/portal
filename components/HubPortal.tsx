"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ROLE_LABELS, type Role } from "@/lib/auth";
import { docIcon } from "@/lib/product-meta";

type HubDoc = {
  id: string;
  title: string;
  tag: string;
  summary: string;
  icon: string;
  chars: number;
  at: string;
};

type GenMsg = {
  role: "user" | "assistant";
  content: string;
  title?: string;
  sources?: string[];
  engine?: string;
};

const SAMPLES = [
  "帮我写一份新产品上线的内部通知",
  "整理一份新员工入职培训要点",
  "根据知识库生成一份客户常见问题 FAQ",
];

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function safeName(title: string | undefined): string {
  return (title || "材料").replace(/[\\/:*?"<>|]/g, "_").slice(0, 60);
}

export default function HubPortal({ username, role }: { username: string; role: Role }) {
  const router = useRouter();

  /* ---------- 知识库材料 ---------- */
  const [docs, setDocs] = useState<HubDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [viewer, setViewer] = useState<{ title: string; text: string } | null>(null);

  const loadDocs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/hub/kb", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setDocs(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return docs;
    return docs.filter((d) =>
      `${d.title} ${d.summary} ${d.tag}`.toLowerCase().includes(k)
    );
  }, [docs, q]);

  async function openDoc(d: HubDoc) {
    setViewer({ title: d.title, text: "加载中…" });
    try {
      const res = await fetch(`/api/hub/kb/${encodeURIComponent(d.id)}?mode=view`);
      const text = await res.text();
      if (!res.ok) throw new Error(text || "读取失败");
      setViewer({ title: d.title, text });
    } catch (e: any) {
      setViewer({ title: d.title, text: `读取失败：${e.message || "未知错误"}` });
    }
  }

  /* ---------- 对话生成材料 ---------- */
  const [messages, setMessages] = useState<GenMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [genErr, setGenErr] = useState("");
  const [copied, setCopied] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function generate(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setBusy(true);
    setGenErr("");
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    try {
      const res = await fetch("/api/hub/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "生成失败");
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: data.content || "",
          title: data.title,
          sources: data.sources,
          engine: data.engine,
        },
      ]);
    } catch (e: any) {
      setGenErr(e.message || "生成失败");
      setMessages((m) => m.filter((x, i) => !(i === m.length - 1 && x.role === "user")));
    } finally {
      setBusy(false);
    }
  }

  async function copyContent(m: GenMsg) {
    try {
      await navigator.clipboard.writeText(m.content);
      setCopied("已复制到剪贴板");
      setTimeout(() => setCopied(""), 2000);
    } catch {
      setCopied("复制失败，请手动选择文本");
      setTimeout(() => setCopied(""), 2000);
    }
  }

  function downloadMd(m: GenMsg) {
    download(`${safeName(m.title)}.md`, new Blob([m.content], { type: "text/markdown;charset=utf-8" }));
  }

  function downloadTxt(m: GenMsg) {
    download(`${safeName(m.title)}.txt`, new Blob([m.content], { type: "text/plain;charset=utf-8" }));
  }

  /** 生成 Word 兼容的 .doc（HTML 包装，Word/WPS 可直接打开编辑） */
  function downloadDoc(m: GenMsg) {
    const html =
      `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">` +
      `<head><meta charset="utf-8"><title>${esc(m.title || "材料")}</title></head>` +
      `<body style="font-family:'Microsoft YaHei','PingFang SC',sans-serif;font-size:12pt;white-space:pre-wrap;line-height:1.7;">` +
      esc(m.content) +
      `</body></html>`;
    download(`${safeName(m.title)}.doc`, new Blob(["\ufeff" + html], { type: "application/msword" }));
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.refresh();
  }

  return (
    <main className="min-h-screen">
      {/* 顶栏 */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#06080f]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2 font-semibold">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-blue to-brand-violet text-lg">
              📚
            </span>
            企业知识中枢
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="rounded-full bg-brand-violet/20 px-3 py-1 text-brand-violet">
              {ROLE_LABELS[role] || "员工"}
            </span>
            <span className="text-slate-400">{username}</span>
            <button onClick={logout} className="text-slate-400 hover:text-white">退出</button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-5">
        {/* 左：知识库材料 */}
        <section className="glass p-6 lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">知识库材料（{docs.length}）</h2>
            <button onClick={loadDocs} className="text-xs text-slate-400 hover:text-white">刷新</button>
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索材料标题 / 关键词"
            className="input-base mt-4"
          />

          {loading ? (
            <p className="mt-4 text-sm text-slate-500">加载中…</p>
          ) : filtered.length === 0 ? (
            <p className="mt-4 rounded-xl border border-white/10 p-4 text-sm text-slate-400">
              {docs.length === 0
                ? "知识库还没有文档。请管理员在后台「知识库」导入 Word / Excel / PDF 后，这里即可检索与下载。"
                : "没有匹配的材料，换个关键词试试。"}
            </p>
          ) : (
            <ul className="mt-4 max-h-[60vh] space-y-2 overflow-y-auto pr-1">
              {filtered.map((d) => (
                <li key={d.id} className="rounded-xl border border-white/10 p-3">
                  <div className="flex items-start gap-3">
                    <span className="text-xl">{d.icon || docIcon(d.tag)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-100" title={d.title}>
                        {d.title}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {d.tag.toUpperCase()} · {d.chars} 字 · {d.at}
                      </div>
                      {d.summary && (
                        <p className="mt-1 line-clamp-2 text-xs text-slate-500">{d.summary}</p>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => openDoc(d)}
                      className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10"
                    >
                      在线阅读
                    </button>
                    <a
                      href={`/api/hub/kb/${encodeURIComponent(d.id)}`}
                      className="rounded-lg border border-brand-cyan/40 px-3 py-1.5 text-xs text-brand-cyan hover:bg-brand-cyan/10"
                    >
                      下载文本版
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 右：对话生成材料 */}
        <section className="glass flex flex-col p-6 lg:col-span-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">AI 材料生成</h2>
            <span className="text-xs text-slate-500">依据知识库起草，可下载</span>
          </div>

          <div ref={listRef} className="mt-4 max-h-[55vh] min-h-[16rem] flex-1 space-y-4 overflow-y-auto pr-1">
            {messages.length === 0 && (
              <div className="rounded-xl border border-white/10 p-4 text-sm text-slate-400">
                <p>描述你想要的材料，AI 会基于公司知识库起草，并可下载为 Word / Markdown / 文本文件。</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {SAMPLES.map((s) => (
                    <button
                      key={s}
                      onClick={() => generate(s)}
                      className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                <div
                  className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-gradient-to-r from-brand-blue to-brand-violet text-white"
                      : "border border-white/10 bg-white/5 text-slate-200"
                  }`}
                >
                  <div className="whitespace-pre-wrap break-words">{m.content}</div>
                  {m.role === "assistant" && (
                    <div className="mt-3 border-t border-white/10 pt-2">
                      {m.sources && m.sources.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {m.sources.map((s) => (
                            <span
                              key={s}
                              className="rounded-full bg-brand-cyan/10 px-2 py-0.5 text-xs text-brand-cyan"
                              title="生成依据的知识库文档"
                            >
                              依据《{s}》
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => downloadDoc(m)}
                          className="rounded-lg border border-brand-cyan/40 px-3 py-1.5 text-xs text-brand-cyan hover:bg-brand-cyan/10"
                        >
                          下载 Word
                        </button>
                        <button
                          onClick={() => downloadMd(m)}
                          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10"
                        >
                          下载 .md
                        </button>
                        <button
                          onClick={() => downloadTxt(m)}
                          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10"
                        >
                          下载 .txt
                        </button>
                        <button
                          onClick={() => copyContent(m)}
                          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10"
                        >
                          复制全文
                        </button>
                      </div>
                      {copied && <p className="mt-2 text-xs text-emerald-400">{copied}</p>}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {busy && <p className="text-sm text-brand-cyan">正在依据知识库起草材料…</p>}
            {genErr && <p className="text-sm text-red-400">{genErr}</p>}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              generate(input);
            }}
            className="mt-4 flex gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="例如：根据售后政策写一份给客户的延期发货致歉函"
              className="input-base flex-1"
            />
            <button type="submit" disabled={busy} className="btn-primary shrink-0">
              {busy ? "生成中…" : "生成材料"}
            </button>
          </form>
        </section>
      </div>

      {/* 材料阅读弹层 */}
      {viewer && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setViewer(null)}>
          <div
            className="glass flex max-h-[85vh] w-full max-w-3xl flex-col p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="truncate text-lg font-semibold text-white">{viewer.title}</h3>
              <button onClick={() => setViewer(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="mt-4 flex-1 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-slate-900/60 p-4 text-sm leading-relaxed text-slate-200">
              {viewer.text}
            </div>
          </div>
        </div>
      )}

      <p className="pb-8 text-center text-xs text-slate-600">
        材料内容由 AI 依据知识库生成，请审阅后使用 ·{" "}
        <Link href="/" className="hover:text-slate-400">返回官网</Link>
      </p>
    </main>
  );
}
