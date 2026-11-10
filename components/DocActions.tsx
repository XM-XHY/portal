"use client";

import PayGate from "@/components/PayGate";

/**
 * 产品资料的「在线阅读 / 下载」按钮。
 * 原来是两个裸 <a href>，任何人直接请求接口就能拿到全文，付费墙有旁路。
 * 现在改为先走 PayGate（免费直放 / 付费扫码），拿到服务端签发的 grant 票据后再打开资源。
 */
function openDoc(docId: string, mode: "view" | "download", grant?: string) {
  const u = `/api/products/doc/${encodeURIComponent(docId)}?mode=${mode}&grant=${encodeURIComponent(grant || "")}`;
  if (mode === "view") window.open(u, "_blank", "noopener,noreferrer");
  else window.location.href = u;
}

export function DocViewButton({ docId, productId }: { docId: string; productId: string }) {
  return (
    <PayGate
      productId={productId}
      label="在线阅读"
      client="产品资料在线阅读"
      className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10"
      onGranted={(g) => openDoc(docId, "view", g)}
    />
  );
}

export function DocDownloadButton({ docId, productId }: { docId: string; productId: string }) {
  return (
    <PayGate
      productId={productId}
      label="下载文本版"
      client="产品资料下载"
      className="rounded-lg border border-brand-cyan/40 px-3 py-1.5 text-xs text-brand-cyan transition hover:bg-brand-cyan/10"
      onGranted={(g) => openDoc(docId, "download", g)}
    />
  );
}
