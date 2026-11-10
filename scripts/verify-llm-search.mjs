/**
 * 零成本方案自检：验证智谱 GLM（永久免费档）与博查搜索是否可用。
 *
 * ⚠️ 密钥一律通过 argv 传入，不要写进内联字符串（沙箱可能改写内联值导致 401 误判）。
 *
 * 用法：
 *   node scripts/verify-llm-search.mjs "<ZHIPU_API_KEY>" "<BOCHA_API_KEY>" ["查询词"]
 *   node scripts/verify-llm-search.mjs --ping            # 只测网络连通性，不需要密钥
 */
const args = process.argv.slice(2);

async function ping() {
  const targets = [
    ["智谱 open.bigmodel.cn", "https://open.bigmodel.cn/api/paas/v4/chat/completions"],
    ["博查 api.bochaai.com", "https://api.bochaai.com/v1/web-search"],
    ["硅基流动 api.siliconflow.cn", "https://api.siliconflow.cn/v1/chat/completions"],
  ];
  for (const [name, url] of targets) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer ping" },
        body: JSON.stringify({ model: "x", messages: [{ role: "user", content: "hi" }] }),
        signal: AbortSignal.timeout(8000),
      });
      // 401/400 都说明网络可达（被服务端正常拒绝），000/超时才是网络不通
      console.log(`[ping] ${name}: 可达，HTTP ${res.status}`);
    } catch (e) {
      console.log(`[ping] ${name}: 不可达 — ${e.message}`);
    }
  }
}

async function checkZhipu(key) {
  const res = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "glm-4.5-flash",
      messages: [{ role: "user", content: "用一句话介绍你自己" }],
      max_tokens: 100,
      // 与 lib/llm.ts 保持一致：关闭思考模式，否则 content 会被 reasoning 吃空
      thinking: { type: "disabled" },
    }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.log(`[智谱] 失败 HTTP ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
    return false;
  }
  const msg = data?.choices?.[0]?.message || {};
  const text = msg.content;
  console.log(`[智谱] ✓ glm-4.5-flash 可用（永久免费档）`);
  console.log(`[智谱] 回复预览：${String(text ?? "").slice(0, 120)}`);
  if (!text) {
    console.log(`[智谱] ⚠ content 为空，完整响应：${JSON.stringify(data).slice(0, 800)}`);
    console.log(`[智谱] 提示：若 reasoning_content 有值，说明该模型默认走思考模式，需在代码里取 content 或关掉 thinking`);
  }
  console.log(`[智谱] 用量：${JSON.stringify(data?.usage || {})}`);
  return true;
}

async function checkBocha(key, query) {
  const res = await fetch("https://api.bochaai.com/v1/web-search", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, count: 5, summary: true, freshness: "noLimit" }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.log(`[博查] 失败 HTTP ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
    return false;
  }
  const pages = data?.data?.webPages?.value ?? data?.webPages?.value ?? [];
  console.log(`[博查] ✓ 可用，返回 ${pages.length} 条结果`);
  pages.slice(0, 3).forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.name || p.title} — ${p.url}`);
  });
  return true;
}

(async () => {
  if (args[0] === "--ping" || args.length === 0) {
    await ping();
    return;
  }
  const [zhipuKey, bochaKey, query] = args;
  if (zhipuKey && zhipuKey !== "-") await checkZhipu(zhipuKey).catch((e) => console.log("[智谱] 异常:", e.message));
  if (bochaKey && bochaKey !== "-") await checkBocha(bochaKey, query || "企业 AI 中台 解决方案").catch((e) => console.log("[博查] 异常:", e.message));
})();
