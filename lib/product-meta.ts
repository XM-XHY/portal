/**
 * 产品中心的纯常量 / 纯函数（无任何服务端依赖，客户端组件可安全引入）。
 * 服务端专用读取函数放在 lib/products.ts。
 */

export type ProductKind = "product" | "solution";

export const PRODUCT_KINDS: ProductKind[] = ["product", "solution"];

/** 产品资料文档的内容类型 */
export const PDOC_TYPE = "pdoc";

export const KIND_LABEL: Record<ProductKind, string> = {
  product: "产品",
  solution: "解决方案",
};

export const KIND_ICON: Record<ProductKind, string> = {
  product: "📦",
  solution: "🧩",
};

const DOC_ICON: Record<string, string> = {
  docx: "📝",
  doc: "📝",
  xlsx: "📊",
  xls: "📊",
  csv: "📊",
  pdf: "📕",
  txt: "📄",
  md: "📄",
};

export function docIcon(ext: string): string {
  return DOC_ICON[(ext || "").toLowerCase()] || "📄";
}

export function isProductKind(t: unknown): t is ProductKind {
  return t === "product" || t === "solution";
}

/** 产品资料单文件大小上限与允许的文件类型 */
export const PDOC_MAX_SIZE = 10 * 1024 * 1024; // 10MB
export const PDOC_ACCEPT = ".docx,.doc,.xlsx,.xls,.csv,.pdf,.txt,.md";
