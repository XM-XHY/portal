/** 用不同请求体组合逐个测试 Tavily，定位 400 原因。密钥从 .env.local 读取。 */
import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const KEY = env.TAVILY_API_KEY || "";
console.log("本地 .env.local 中的密钥:", KEY ? `${KEY.slice(0, 8)}…${KEY.slice(-4)} (len=${KEY.length})` : "(空)");

const cases = [
  { name: "A body.api_key / max=5 / answer=true", body: { api_key: KEY, query: "智能制造", max_results: 5, search_depth: "basic", include_answer: true } },
  { name: "B body.api_key / max=10 / answer=true", body: { api_key: KEY, query: "智能制造", max_results: 10, search_depth: "basic", include_answer: true } },
  { name: "C Bearer 头 / max=10 / answer=true", body: { query: "智能制造", max_results: 10, search_depth: "basic", include_answer: true }, bearer: true },
  { name: "D Bearer 头 / max=10 / 无 answer", body: { query: "智能制造", max_results: 10, search_depth: "basic" }, bearer: true },
  { name: "E Bearer 头 / max=10 / answer=advanced", body: { query: "智能制造", max_results: 10, search_depth: "basic", include_answer: "advanced" }, bearer: true },
];

for (const c of cases) {
  const headers = { "Content-Type": "application/json" };
  if (c.bearer) headers.Authorization = `Bearer ${KEY}`;
  try {
    const r = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers,
      body: JSON.stringify(c.body),
    });
    const t = await r.text();
    console.log(`${r.status}  ${c.name}  →  ${t.slice(0, 160).replace(/\n/g, " ")}`);
  } catch (e) {
    console.log(`ERR  ${c.name}  →  ${e.message}`);
  }
}
