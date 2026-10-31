/** 生成一个最小合法 PDF 并验证 pdf-parse v2 / xlsx / mammoth 可提取文本 */
const fs = require("fs");

function buildPdf(text) {
  const objs = [];
  objs.push("<< /Type /Catalog /Pages 2 0 R >>");
  objs.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  objs.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>");
  objs.push(`<< /Length ${text.length + 20} >>\nstream\nBT /F1 24 Tf 72 700 Td (${text}) Tj ET\nendstream`);
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => { out += String(o).padStart(10, "0") + " 00000 n \n"; });
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, "latin1");
}

(async () => {
  // 1) PDF（v2 API: new PDFParse({data}) -> getText()）
  fs.writeFileSync("/tmp/kb-test.pdf", buildPdf("Hello KB 2026 revenue growth"));
  const { PDFParse } = require("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(fs.readFileSync("/tmp/kb-test.pdf")) });
  try {
    const r = await parser.getText();
    const text = (r.text || "").trim();
    console.log("PDF 提取:", JSON.stringify(text));
    console.log(text.includes("Hello KB") ? "PDF 解析 OK" : "PDF 解析异常");
  } finally {
    await parser.destroy();
  }

  // 2) xlsx
  const XLSX = require("xlsx");
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([["产品", "价格"], ["智能客服", "5万/年"]]);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const csv = XLSX.utils.sheet_to_csv(ws);
  console.log("xlsx 转文本:", JSON.stringify(csv.replace(/\n/g, " | ")));

  // 3) mammoth 加载检查
  const mammoth = require("mammoth");
  console.log("mammoth 加载 OK:", typeof mammoth.extractRawText === "function");
})();
