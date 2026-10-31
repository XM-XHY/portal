export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  source: string;
  publishedAt?: string;
};

export type SearchSource = { n: number; title: string; url: string };

export type SearchResponse = {
  query: string;
  results: SearchResult[];
  /** LLM 生成的带引用摘要（仅真实检索 + 配置了 LLM 密钥时出现） */
  summary?: string;
  /** 摘要中引用的来源清单 */
  sources?: SearchSource[];
  fetchedAt: string;
  provider: "bing" | "serpapi" | "mock";
  note?: string;
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "未知来源";
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms: number
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * 真实 Bing Web Search v7 调用。失败抛错，由 searchWeb 统一降级。
 */
async function bingSearch(query: string): Promise<SearchResult[]> {
  const key = process.env.BING_API_KEY!;
  const mkt = process.env.SEARCH_MKT || "zh-CN";
  const url = new URL("https://api.bing.microsoft.com/v7.0/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "10");
  url.searchParams.set("mkt", mkt);
  url.searchParams.set("textDecorations", "false");
  url.searchParams.set("safeSearch", "Moderate");

  const res = await fetchWithTimeout(
    url.toString(),
    { headers: { "Ocp-Apim-Subscription-Key": key }, cache: "no-store" },
    8000
  );
  if (!res.ok) throw new Error(`Bing ${res.status}`);
  const data = await res.json();
  return (data.webPages?.value || []).map((it: any) => ({
    title: it.name,
    url: it.url,
    snippet: it.snippet,
    source: hostOf(it.url),
    publishedAt: it.dateLastCrawled
      ? new Date(it.dateLastCrawled).toISOString().slice(0, 10)
      : undefined,
  }));
}

/**
 * 可选：SerpAPI（Google 结果）。当未配置 Bing 但配置了 SerpAPI 时使用。
 */
async function serpSearch(query: string): Promise<SearchResult[]> {
  const key = process.env.SERPAPI_KEY!;
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("q", query);
  url.searchParams.set("num", "10");
  url.searchParams.set("hl", "zh-cn");
  url.searchParams.set("api_key", key);

  const res = await fetchWithTimeout(url.toString(), { cache: "no-store" }, 8000);
  if (!res.ok) throw new Error(`SerpAPI ${res.status}`);
  const data = await res.json();
  return (data.organic_results || []).map((it: any) => ({
    title: it.title,
    url: it.link,
    snippet: it.snippet || "",
    source: hostOf(it.link),
    publishedAt: it.date || undefined,
  }));
}

/**
 * 可选：调用 OpenAI 兼容大模型，基于真实检索结果生成"带引用的摘要"。
 * 仅当配置了 LLM_API_KEY 且为真实检索结果时调用。失败/超时返回 null（不影响结果展示）。
 */
async function llmSummarize(
  query: string,
  results: SearchResult[]
): Promise<{ summary?: string; sources?: SearchSource[] } | null> {
  const key = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
  if (!key || results.length === 0) return null;
  const base = process.env.LLM_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.LLM_MODEL || "gpt-4o-mini";

  const ctx = results
    .slice(0, 6)
    .map(
      (r, i) =>
        `${i + 1}. ${r.title}\n${r.snippet}\n来源：${r.source}`
    )
    .join("\n\n");

  const sys =
    "你是企业级检索摘要助手。请根据【检索结果】用简体中文撰写不超过160字的客观摘要，" +
    "在相关句末用方括号标注引用编号，如[1]、[2]。只基于检索结果陈述事实，绝不编造。" +
    "最后另起一行仅输出一个 JSON：{\"refs\":[1,3]}，refs 为你在摘要中实际引用过的检索结果序号数组。" +
    "除摘要与 JSON 外不要输出其他内容。";
  const user = `关键词：${query}\n\n检索结果：\n${ctx}`;

  try {
    const res = await fetchWithTimeout(
      `${base}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: sys },
            { role: "user", content: user },
          ],
          temperature: 0.2,
          max_tokens: 400,
        }),
      },
      9000
    );
    if (!res.ok) return null;
    const data = await res.json();
    const text = (data.choices?.[0]?.message?.content || "").trim();
    const m = text.match(/\{[\s\S]*"refs"[\s\S]*\}/);
    let refs: number[] = [];
    let summary = text;
    if (m) {
      try {
        const parsed = JSON.parse(m[0]);
        if (Array.isArray(parsed.refs)) refs = parsed.refs.filter((n: any) => Number.isInteger(n));
      } catch {
        /* ignore */
      }
      summary = text.slice(0, m.index).trim();
    }
    const sources: SearchSource[] = refs
      .map((n) => results[n - 1])
      .filter(Boolean)
      .map((r, i) => ({ n: i + 1, title: r.title, url: r.url }));
    return { summary: summary || undefined, sources: sources.length ? sources : undefined };
  } catch {
    return null;
  }
}

function mockResults(query: string): SearchResult[] {
  const base = [
    {
      title: `${query}：企业落地实践与架构选型`,
      snippet: `本文系统梳理 ${query} 的主流技术方案、成本结构与上线路径，帮助企业快速决策。`,
    },
    {
      title: `2026 ${query} 行业报告`,
      snippet: `权威机构发布的最新 ${query} 市场数据，含规模、增速与头部厂商对比。`,
    },
    {
      title: `${query} 常见误区与合规要点`,
      snippet: `从数据安全到内容版权，解读 ${query} 落地过程中的关键风险与规避方式。`,
    },
    {
      title: `客户案例：${query} 如何提升转化`,
      snippet: `某行业头部企业通过 ${query} 将线索响应效率提升 3 倍，附实施细节。`,
    },
    {
      title: `${query} 工具横评`,
      snippet: `对比市面上主流 ${query} 工具的能力、价格与适用场景，给出选型建议。`,
    },
  ];
  return base.map((b, i) => ({
    ...b,
    url: `https://www.example.com/result/${i + 1}?q=${encodeURIComponent(query)}`,
    source: ["techcrunch.com", "36kr.com", "infoq.cn", "csdn.net", "zhihu.com"][i],
    publishedAt: new Date(Date.now() - i * 86400000).toISOString().slice(0, 10),
  }));
}

/**
 * 全网检索主入口。
 * 优先级：Bing（BING_API_KEY）→ SerpAPI（SERPAPI_KEY）→ 内置示例数据（mock）。
 * 真实检索且配置了 LLM_API_KEY 时，附加"带引用来源的摘要"。
 */
export async function searchWeb(query: string): Promise<SearchResponse> {
  const fetchedAt = new Date().toISOString();
  const q = query.trim();

  if (process.env.BING_API_KEY) {
    try {
      const results = await bingSearch(q);
      const llm = await llmSummarize(q, results);
      return { query: q, results, fetchedAt, provider: "bing", ...llm };
    } catch {
      const results = mockResults(q);
      return {
        query: q,
        results,
        fetchedAt,
        provider: "mock",
        note: "搜索服务暂不可用，已展示示例数据。",
      };
    }
  }

  if (process.env.SERPAPI_KEY) {
    try {
      const results = await serpSearch(q);
      const llm = await llmSummarize(q, results);
      return { query: q, results, fetchedAt, provider: "serpapi", ...llm };
    } catch {
      const results = mockResults(q);
      return {
        query: q,
        results,
        fetchedAt,
        provider: "mock",
        note: "搜索服务暂不可用，已展示示例数据。",
      };
    }
  }

  return {
    query: q,
    results: mockResults(q),
    fetchedAt,
    provider: "mock",
    note: "未配置 BING_API_KEY / SERPAPI_KEY，当前为示例数据；配置后即为真实全网检索。",
  };
}
