/**
 * 知识库（KB）核心：
 * 1) parseDocument(buffer, ext) —— Word/Excel/PDF/TXT/MD → 纯文本
 * 2) chunkText(text) —— 按段落切块
 * 3) searchKnowledge(docs, question) —— 关键词重合度评分检索最相关片段
 */
import type { ContentItem, ContentType } from "./data/types";

export type KbDoc = ContentItem; // 复用内容模型：type="kb"，body=全文，tag=扩展名

export const KB_TYPE: ContentType = "kb";

export const KB_ACCEPT = ".docx,.doc,.xlsx,.xls,.csv,.pdf,.txt,.md";
export const KB_MAX_SIZE = 10 * 1024 * 1024; // 10MB

const ICON_BY_EXT: Record<string, string> = {
  docx: "📝", doc: "📝", xlsx: "📊", xls: "📊", csv: "📊",
  pdf: "📕", txt: "📄", md: "📄",
};

/** 按扩展名把文件缓冲解析为纯文本（服务端调用） */
export async function parseDocument(
  buf: Buffer,
  filename: string
): Promise<{ text: string; ext: string }> {
  const ext = (filename.split(".").pop() || "").toLowerCase();

  if (ext === "docx" || ext === "doc") {
    const mammoth = (await import("mammoth")).default as any;
    const r = await mammoth.extractRawText({ buffer: buf });
    return { text: normalize(r.value), ext };
  }

  if (ext === "xlsx" || ext === "xls" || ext === "csv") {
    const XLSX = await import("xlsx");
    // codepage 65001 = UTF-8：CSV 无 BOM 时 SheetJS 默认按 Latin-1 解码会乱码
    const wb = XLSX.read(buf, { type: "buffer", codepage: 65001 });
    const parts: string[] = [];
    for (const name of wb.SheetNames) {
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
      if (csv.trim()) parts.push(`# 工作表：${name}\n${csv.trim()}`);
    }
    return { text: normalize(parts.join("\n\n")), ext };
  }

  if (ext === "pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    try {
      const r = await parser.getText();
      return { text: normalize(r.text || ""), ext };
    } finally {
      await parser.destroy().catch(() => {});
    }
  }

  if (ext === "txt" || ext === "md") {
    return { text: normalize(buf.toString("utf8")), ext };
  }

  throw new Error(`暂不支持 .${ext} 格式（支持 Word/Excel/CSV/PDF/TXT/MD）`);
}

function normalize(s: string): string {
  return (s || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 按段落切块，每块 ≤ chunkSize 字符 */
export function chunkText(text: string, chunkSize = 500): string[] {
  const paras = text.split(/\n{2,}|\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let cur = "";
  for (const p of paras) {
    // 超长段落内部再切
    if (p.length > chunkSize) {
      if (cur) { chunks.push(cur); cur = ""; }
      for (let i = 0; i < p.length; i += chunkSize) chunks.push(p.slice(i, i + chunkSize));
      continue;
    }
    if ((cur + "\n" + p).length > chunkSize) {
      if (cur) chunks.push(cur);
      cur = p;
    } else {
      cur = cur ? `${cur}\n${p}` : p;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/** 中文分词的轻量替代：抽出连续的 2-4 字词块 + 英文/数字词 */
export function tokenize(q: string): string[] {
  const tokens = new Set<string>();
  const cleaned = q.replace(/[，。！？、：；""''（）【】\s,.\?!:;()\-_/\\]+/g, " ");
  for (const word of cleaned.split(" ").filter(Boolean)) {
    if (/^[a-zA-Z0-9]+$/.test(word)) {
      tokens.add(word.toLowerCase());
      continue;
    }
    // 中文：滑窗 bigram 覆盖词组
    for (let i = 0; i < word.length - 1; i++) tokens.add(word.slice(i, i + 2));
    if (word.length <= 4) tokens.add(word);
  }
  return Array.from(tokens).filter((t) => t.length >= 2);
}

export type KbHit = { doc: KbDoc; chunk: string; score: number };

/**
 * 检索：对每个文档分块，按问题词块命中数评分，返回 Top N 片段。
 * 无命中返回空数组（由调用方降级到常规应答）。
 */
export function searchKnowledge(
  docs: KbDoc[],
  question: string,
  topN = 3
): KbHit[] {
  const tokens = tokenize(question);
  if (!tokens.length) return [];

  const hits: KbHit[] = [];
  for (const doc of docs) {
    if (!doc.body) continue;
    for (const chunk of chunkText(doc.body)) {
      const lower = chunk.toLowerCase();
      let score = 0;
      for (const t of tokens) {
        if (lower.includes(t)) score += t.length; // 长词块权重更高
      }
      // 标题命中加权
      const titleLower = (doc.title || "").toLowerCase();
      for (const t of tokens) if (titleLower.includes(t)) score += 2;
      if (score > 0) hits.push({ doc, chunk, score });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, topN);
}

/** 把命中片段格式化为可引用文本块（用于 LLM prompt 或直接回复） */
export function formatHits(hits: KbHit[]): string {
  return hits
    .map(
      (h, i) =>
        `[知识${i + 1}]（来自《${h.doc.title}》）\n${h.chunk}`
    )
    .join("\n\n");
}
