"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type Msg = { role: "user" | "assistant"; content: string; engine?: "llm" | "rules" };

const QUICK_QUESTIONS = [
  "你们能做什么？",
  "产品怎么收费？",
  "有哪些客户案例？",
  "怎么联系你们？",
];

/** 极简渲染：换行 + [文字](url) 链接，不引入 markdown 依赖 */
function renderContent(text: string) {
  const parts: (string | { href: string; label: string })[] = [];
  const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push({ href: m[2], label: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.map((p, i) =>
    typeof p === "string" ? (
      <span key={i} className="whitespace-pre-wrap">{p}</span>
    ) : (
      <a
        key={i}
        href={p.href}
        target={p.href.startsWith("http") ? "_blank" : undefined}
        rel="noopener noreferrer"
        className="text-brand-cyan underline underline-offset-2 hover:text-brand-blue"
      >
        {p.label}
      </a>
    )
  );
}

export default function ChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [nudge, setNudge] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hidden = pathname?.startsWith("/admin");
  const companyName = "XX 科技";

  // 初始欢迎语
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          role: "assistant",
          content:
            "你好！我是智能客服助手 👋\n可以为你介绍产品、查询案例、解答价格与合作问题。试试下面的快捷提问，或直接输入你的问题。",
        },
      ]);
    }
  }, [messages.length]);

  // 8 秒后轻提示气泡（每会话一次）
  useEffect(() => {
    const t = setTimeout(() => setNudge(true), 8000);
    return () => clearTimeout(t);
  }, []);

  // 打开时聚焦输入框；ESC 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => inputRef.current?.focus(), 150);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open]);

  // 新消息滚动到底部
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const send = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || loading) return;
      const next: Msg[] = [...messages, { role: "user", content: q }];
      setMessages(next);
      setInput("");
      setLoading(true);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: next
              .filter((m) => m.role === "user" || m.role === "assistant")
              .slice(-10)
              .map((m) => ({ role: m.role, content: m.content })),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setMessages((v) => [...v, { role: "assistant", content: data.error || "服务繁忙，请稍后再试。" }]);
        } else {
          setMessages((v) => [...v, { role: "assistant", content: data.reply, engine: data.engine }]);
        }
      } catch {
        setMessages((v) => [...v, { role: "assistant", content: "网络异常，请稍后再试。" }]);
      } finally {
        setLoading(false);
      }
    },
    [messages, loading]
  );

  // 供其它组件（如首页产品卡片）打开聊天窗
  useEffect(() => {
    const opener = () => setOpen(true);
    window.addEventListener("open-chat", opener);
    return () => window.removeEventListener("open-chat", opener);
  }, []);

  if (hidden) return null;

  return (
    <>
      {/* 悬浮球 */}
      <button
        onClick={() => { setOpen((v) => !v); setNudge(false); }}
        aria-label="打开智能客服"
        className="fixed bottom-20 right-4 z-50 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-brand-blue to-brand-violet text-2xl shadow-lg shadow-brand-blue/30 transition hover:scale-105 md:bottom-6 md:right-6"
      >
        {open ? "✕" : "💬"}
        {!open && nudge && (
          <span className="absolute -left-2 top-1 h-3 w-3 animate-ping rounded-full bg-brand-cyan/70" />
        )}
      </button>

      {/* 轻提示气泡 */}
      {!open && nudge && (
        <div className="fixed bottom-[8.5rem] right-4 z-50 max-w-[220px] rounded-2xl rounded-br-sm border border-white/10 bg-slate-900/95 p-3 text-xs leading-relaxed text-slate-300 shadow-xl md:bottom-24 md:right-6">
          有 AI 方面的问题？点我可以直接聊 🙂
          <button onClick={() => setNudge(false)} className="mt-1 block text-slate-500 hover:text-slate-300">知道了</button>
        </div>
      )}

      {/* 聊天窗口 */}
      {open && (
        <div className="fixed inset-x-3 bottom-36 z-50 flex h-[70vh] max-h-[560px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl backdrop-blur md:inset-x-auto md:bottom-24 md:right-6 md:w-[380px]">
          {/* 头部 */}
          <div className="flex items-center gap-3 border-b border-white/10 bg-white/5 px-4 py-3">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-brand-blue to-brand-violet text-lg">🤖</div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-white">智能客服 Copilot</div>
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                在线 · {companyName}
              </div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="关闭" className="text-slate-400 hover:text-white">✕</button>
          </div>

          {/* 消息列表 */}
          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[85%] rounded-2xl rounded-br-sm bg-brand-blue/90 px-3.5 py-2.5 text-sm leading-relaxed text-white"
                      : "max-w-[85%] rounded-2xl rounded-bl-sm border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm leading-relaxed text-slate-200"
                  }
                >
                  {renderContent(m.content)}
                  {m.role === "assistant" && m.engine && (
                    <div className="mt-1.5 text-[10px] text-slate-500">
                      {m.engine === "llm" ? "AI 模型生成" : "知识库应答"}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="flex gap-1 rounded-2xl rounded-bl-sm border border-white/10 bg-white/5 px-4 py-3">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
                </div>
              </div>
            )}

            {/* 快捷提问（仅开头展示） */}
            {messages.length <= 1 && !loading && (
              <div className="flex flex-wrap gap-2 pt-1">
                {QUICK_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-slate-300 transition hover:border-brand-cyan/50 hover:text-brand-cyan"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 输入区 */}
          <form
            onSubmit={(e) => { e.preventDefault(); send(input); }}
            className="flex items-center gap-2 border-t border-white/10 bg-white/5 p-3"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={500}
              placeholder="输入你的问题…"
              className="flex-1 rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-brand-cyan/60"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-blue to-brand-violet text-white transition disabled:opacity-40"
              aria-label="发送"
            >
              ➤
            </button>
          </form>
        </div>
      )}
    </>
  );
}
