"use client";

/** 触发全局 AI 客服聊天窗打开的按钮（与 ChatWidget 通过 window 事件联动）。 */
export default function OpenChatButton({
  label = "💬 在线体验 AI 客服",
  className = "btn-primary w-full",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("open-chat"))}
      className={className}
    >
      {label}
    </button>
  );
}
