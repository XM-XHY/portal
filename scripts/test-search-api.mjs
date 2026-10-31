/** 用严格 UTF-8 百分号编码请求本地 /api/search，验证中文关键词是否被服务端正确处理。 */
const BASE = process.env.BASE || "http://localhost:3000";
const queries = ["智能制造", "企业数字化转型", "人工智能 获客"];

for (const q of queries) {
  const url = `${BASE}/api/search?q=${encodeURIComponent(q)}`;
  try {
    const r = await fetch(url);
    const j = await r.json();
    console.log(`关键词「${q}」 → HTTP ${r.status}`);
    console.log("  provider:", j.provider);
    console.log("  实际查询词(服务端回显):", JSON.stringify(j.query));
    console.log("  结果数:", j.results.length);
    if (j.note) console.log("  note:", j.note);
    if (j.summary) console.log("  summary:", j.summary.slice(0, 100) + "…");
    const first = j.results[0];
    if (first) {
      console.log("  首条:", first.title);
      console.log("        ", first.url);
    }
    console.log("");
  } catch (e) {
    console.log(`关键词「${q}」 请求异常:`, e.message);
  }
  await new Promise((r) => setTimeout(r, 3500)); // 绕过 3s 限流
}
