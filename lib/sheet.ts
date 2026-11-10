/**
 * Excel 读写适配层（替代 SheetJS xlsx@0.18.5）
 *
 * 为什么替换：xlsx@0.18.5 在 npm audit 中被判为 **high** 且官方不再发布修复版
 * （CVE-2023-30533 原型污染、CVE-2024-22363 ReDoS），属于「无补丁」依赖。
 * 本项目改用 exceljs（活跃维护、无已知 high 漏洞），把库差异全部收敛在本文件，
 * 业务代码只依赖下面三个原语，不再直接接触具体表格库：
 *   - readRows()          读第一张表为二维字符串数组
 *   - readSheetTexts()    读全部表为 CSV 文本片段（用于知识库/文档索引）
 *   - buildWorkbookBuffer() 多表工作簿 → xlsx 二进制
 *
 * 兼容性说明：exceljs 不支持旧版二进制 .xls（OLE2/BIFF）。遇到该格式时抛出
 * LegacyXlsError，由上层给出「请另存为 .xlsx」的明确提示，而不是静默返回空表。
 */
import * as ExcelJSModule from "exceljs";

/**
 * exceljs 是 CJS 包，且其导出结构无法被 Node 的 ESM 命名导出探测（cjs-module-lexer）识别：
 *   - webpack / Next.js 下 `import * as X` 能拿到 { Workbook, ... }
 *   - 纯 Node ESM（含 `node --experimental-strip-types`、脚本、将来的原生 TS 运行时）只能拿到 { default: module.exports }
 * 直接写 `import { Workbook } from "exceljs"` 会让「打包能跑、脚本里一 import 就崩」，
 * 因此这里做一次兼容取值，两种环境都能拿到构造函数。
 */
const ExcelJS = (
  (ExcelJSModule as unknown as { Workbook?: unknown }).Workbook
    ? ExcelJSModule
    : (ExcelJSModule as unknown as { default: typeof ExcelJSModule }).default
) as typeof ExcelJSModule;

const { Workbook } = ExcelJS;

export type SheetCell = string | number | boolean | null | undefined;

export type SheetSpec = {
  name: string;
  rows: SheetCell[][];
  /** 列宽：近似字符数（对应原 SheetJS 的 !cols[].wch） */
  colWidths?: number[];
  /** 行高：磅（对应原 SheetJS 的 !rows[].hpt） */
  rowHeights?: number[];
};

/** 旧版 .xls（OLE2/BIFF8）不受支持，需转存为 .xlsx */
export class LegacyXlsError extends Error {
  constructor() {
    super("不支持旧版 .xls 格式，请用 Excel / WPS 打开后「另存为 .xlsx」再上传");
    this.name = "LegacyXlsError";
  }
}

/** 文件头魔数：ZIP（xlsx 本质是 zip）、OLE2（老版 xls） */
const ZIP_SIG = [0x50, 0x4b];
const OLE2_SIG = [0xd0, 0xcf, 0x11, 0xe0];

type BinaryInput = ArrayBuffer | Uint8Array | Buffer;

function toBytes(buf: BinaryInput): Uint8Array {
  if (buf instanceof Uint8Array) return buf;
  return new Uint8Array(buf as ArrayBuffer);
}

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  if (bytes.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (bytes[i] !== sig[i]) return false;
  return true;
}

/**
 * exceljs 单元格值归一化为字符串。
 * 覆盖：普通标量、日期、富文本、公式（取计算结果）、超链接、错误值。
 */
function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) {
    // 只给日期（无时间）时输出 yyyy-mm-dd，避免出现 00:00:00 噪声
    const iso = v.toISOString();
    return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso;
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) {
      return (o.richText as { text?: string }[]).map((t) => t?.text ?? "").join("");
    }
    if ("formula" in o || "sharedFormula" in o) {
      const r = o.result;
      if (r && typeof r === "object" && "error" in (r as object)) return "";
      return cellToString(r);
    }
    if ("text" in o) return cellToString(o.text);
    if ("error" in o) return "";
  }
  return String(v);
}

/** RFC4180 简化解析：支持双引号包裹、"" 转义、CRLF/LF */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // 交给 \n 处理（CRLF）；单独 \r 也视作换行
      if (src[i + 1] !== "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      }
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function isBlankRow(r: string[]): boolean {
  return !r.some((c) => String(c ?? "").trim() !== "");
}

/** 读第一张工作表为二维字符串数组（空白行剔除） */
export async function readRows(buf: BinaryInput): Promise<string[][]> {
  const bytes = toBytes(buf);
  if (startsWith(bytes, OLE2_SIG)) throw new LegacyXlsError();

  // 非 ZIP 视为纯文本 CSV
  if (!startsWith(bytes, ZIP_SIG)) {
    const text = new TextDecoder("utf-8").decode(bytes);
    return parseCsv(text).filter((r) => !isBlankRow(r));
  }

  const wb = new Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const colCount = ws.columnCount;
  const out: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    for (let c = 1; c <= colCount; c++) cells.push(cellToString(row.getCell(c).value));
    while (cells.length && cells[cells.length - 1] === "") cells.pop();
    if (!isBlankRow(cells)) out.push(cells);
  });
  return out;
}

function csvEscape(s: string): string {
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 读全部工作表为 CSV 文本片段（用于知识库检索 / 文档抽取） */
export async function readSheetTexts(buf: BinaryInput): Promise<{ name: string; text: string }[]> {
  const bytes = toBytes(buf);
  if (startsWith(bytes, OLE2_SIG)) throw new LegacyXlsError();

  if (!startsWith(bytes, ZIP_SIG)) {
    const text = new TextDecoder("utf-8").decode(bytes);
    return [{ name: "CSV", text: text.replace(/^\uFEFF/, "") }];
  }

  const wb = new Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  const result: { name: string; text: string }[] = [];
  const sheets = wb.worksheets;
  for (const ws of sheets) {
    const colCount = ws.columnCount;
    const lines: string[] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      for (let c = 1; c <= colCount; c++) cells.push(csvEscape(cellToString(row.getCell(c).value)));
      while (cells.length && cells[cells.length - 1] === "") cells.pop();
      if (!isBlankRow(cells)) lines.push(cells.join(","));
    });
    result.push({ name: ws.name, text: lines.join("\n") });
  }
  return result;
}

/** Excel 工作表名限制：≤31 字符，且不能含 []:*?/\ */
function safeSheetName(name: string): string {
  const cleaned = String(name || "Sheet").replace(/[[\]:*?/\\]/g, "_").trim() || "Sheet";
  return cleaned.slice(0, 31);
}

/** 多表工作簿 → xlsx 二进制（浏览器与服务端通用） */
export async function buildWorkbookBuffer(sheets: SheetSpec[]): Promise<ArrayBuffer> {
  const wb = new Workbook();
  wb.creator = "cnxhy";
  wb.created = new Date();

  const used = new Set<string>();
  for (const spec of sheets) {
    let name = safeSheetName(spec.name);
    // 防止重名（Excel 不允许同名工作表）
    let n = 2;
    while (used.has(name)) name = `${safeSheetName(spec.name).slice(0, 28)}(${n++})`;
    used.add(name);

    const ws = wb.addWorksheet(name);
    for (const row of spec.rows) {
      ws.addRow(row.map((v) => (v === null || v === undefined ? "" : v)));
    }
    if (spec.colWidths?.length) {
      spec.colWidths.forEach((w, i) => {
        if (typeof w === "number" && w > 0) ws.getColumn(i + 1).width = w;
      });
    }
    if (spec.rowHeights?.length) {
      spec.rowHeights.forEach((h, i) => {
        if (typeof h === "number" && h > 0) ws.getRow(i + 1).height = h;
      });
    }
    // 含换行的单元格开启自动换行：课表/名册导出依赖此效果保证打印可读
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        if (typeof cell.value === "string" && cell.value.includes("\n")) {
          cell.alignment = { wrapText: true, vertical: "middle" };
        }
      });
    });
  }

  const out = await wb.xlsx.writeBuffer();
  return out as unknown as ArrayBuffer;
}

/** xlsx 的 MIME，供下载响应复用 */
export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
