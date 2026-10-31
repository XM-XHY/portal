/**
 * 验证 Tavily API Key 是否可用，并预览真实检索结果。
 * 用法：node scripts/verify-tavily.mjs "<tvly-...>" [查询词]
 */
const KEY = process.argv[2] || process.env.TAVILY_API_KEY || "";
const QUERY = process.argv[3] || "人工智能 企业数字化转型";

if (!KEY) {
  console.error("缺少密钥参数");
  process.exit(1);
}

console.log("密钥前缀:", KEY.slice(0, 8), "| 长度:", KEY.length);
console.log("查询词:", QUERY);
console.log("");

const ctrl = new AbortController();
const timer = setTimeout(() => ctrl.abort(), 20000);

try {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: KEY,
      query: QUERY,
      max_results: 5,
      search_depth: "basic",
      include_answer: true,
    }),
    signal: ctrl.signal,
  });

  const text = await res.text();
  console.log("HTTP 状态:", res.status);

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.log("非 JSON 响应:", text.slice(0, 300));
    process.exit(2);
  }

  if (!res.ok) {
    console.log("调用失败:", JSON.stringify(data).slice(0, 400));
    process.exit(3);
  }

  const results = data.results || [];
  console.log("返回条数:", results.length);
  console.log("自带摘要 answer:", data.answer ? String(data.answer).slice(0, 160) + "…" : "(无)");
  console.log("耗时(response_time):", data.response_time ?? "-");
  console.log("");
  console.log("--- 前 5 条真实结果 ---");
  results.slice(0, 5).forEach((r, i) => {
    console.log(`${i + 1}. ${r.title}`);
    console.log(`   ${r.url}`);
    console.log(`   ${String(r.content || "").slice(0, 110)}…`);
    console.log("");
  });
  process.exit(0);
} catch (e) {
  console.log("请求异常:", e.name === "AbortError" ? "超时 20s" : e.message);
  process.exit(4);
} finally {
  clearTimeout(timer);
}
