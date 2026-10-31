export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  source: string;
  publishedAt?: string;
};

export type SearchSource = { n: number; title: string; url: string };

/**
 * 检索供应商。
 * ⚠️ 注意：微软已于 2025-08-11 全面退役 Bing Search API（v7），
 * 新用户无法注册，旧密钥返回 410 Gone。故 bing 仅作历史兼容保留，不推荐使用。
 * 推荐顺序：Brave（每月 $5 免费额度）→ Tavily → SerpAPI。
 */
export type SearchProvider = "brave" | "tavily" | "serpapi" | "bing" | "mock";

/** 供应商中文名，用于前端展示 */
export const PROVIDER_LABEL: Record<SearchProvider, string> = {
  brave: "Brave 全网检索",
  tavily: "Tavily AI 检索",
  serpapi: "SerpAPI 全网检索",
  bing: "Bing 全网检索",
  mock: "示例数据",
};

export type SearchResponse = {
  query: string;
  results: SearchResult[];
  /** LLM 生成的带引用摘要（仅真实检索 + 配置了 LLM 密钥时出现） */
  summary?: string;
  /** 摘要中引用的来源清单 */
  sources?: SearchSource[];
  fetchedAt: string;
  provider: SearchProvider;
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
 * Brave Search API（推荐）。
 * 自建独立索引，返回结构化结果，非抓取 Google/Bing，合规风险低。
 * 定价：$5/1000 次，每月赠送 $5 额度（≈1000 次/月免费）。
 * 申请：https://brave.com/search/api/
 */
async function braveSearch(query: string): Promise<SearchResult[]> {
  const key = process.env.BRAVE_API_KEY!;
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "10");
  url.searchParams.set("search_lang", "zh-hans");
  url.searchParams.set("country", "cn");
  url.searchParams.set("safesearch", "moderate");

  const res = await fetchWithTimeout(
    url.toString(),
    {
      headers: {
        "X-Subscription-Token": key,
        Accept: "application/json",
      },
      cache: "no-store",
    },
    8000
  );
  if (!res.ok) throw new Error(`Brave ${res.status}`);
  const data = await res.json();
  return (data.web?.results || []).map((it: any) => ({
    title: it.title,
    url: it.url,
    snippet: it.description || "",
    source: hostOf(it.url),
    publishedAt: it.page_age
      ? new Date(it.page_age).toISOString().slice(0, 10)
      : undefined,
  }));
}

/**
 * Tavily Search API（面向 AI 应用设计）。
 * 单次调用即可返回 results + 自带 answer 摘要，配 LLM 时效果最好。
 * 定价：约 $0.008/次（basic），注册赠送额度。
 * 申请：https://tavily.com/
 */
async function tavilySearch(
  query: string
): Promise<{ results: SearchResult[]; answer?: string }> {
  const key = process.env.TAVILY_API_KEY!;
  const res = await fetchWithTimeout(
    "https://api.tavily.com/search",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query,
        max_results: 10,
        search_depth: "basic",
        include_answer: true,
      }),
      cache: "no-store",
    },
    8000
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Tavily ${res.status} ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  const results: SearchResult[] = (data.results || []).map((it: any) => ({
    title: it.title,
    url: it.url,
    snippet: it.content || "",
    source: hostOf(it.url),
  }));
  return { results, answer: typeof data.answer === "string" ? data.answer : undefined };
}

/**
 * ⚠️ 已退役：微软 Bing Search API v7 于 2025-08-11 全面下线，
 * 新用户无法注册，历史密钥返回 410 Gone。此函数仅作兼容保留，失败即降级。
 * 迁移建议：改用 BRAVE_API_KEY 或 TAVILY_API_KEY。
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
 *
 * 供应商优先级（配置了哪个就用哪个，失败自动降级到下一个）：
 *   Brave(BRAVE_API_KEY) → Tavily(TAVILY_API_KEY) → SerpAPI(SERPAPI_KEY) → Bing(BING_API_KEY，已退役) → 示例数据
 * 也可用 SEARCH_PROVIDER=brave|tavily|serpapi|bing 强制指定。
 *
 * 真实检索且配置了 LLM_API_KEY 时，附加"带引用来源的摘要"；
 * Tavily 自带 answer，未配 LLM 时也会直接展示。
 */
export async function searchWeb(query: string): Promise<SearchResponse> {
  const fetchedAt = new Date().toISOString();
  const q = query.trim();
  const forced = (process.env.SEARCH_PROVIDER || "").trim().toLowerCase();

  type Attempt = {
    id: SearchProvider;
    ready: boolean;
    run: () => Promise<{ results: SearchResult[]; answer?: string }>;
  };

  const attempts: Attempt[] = [
    {
      id: "brave",
      ready: !!process.env.BRAVE_API_KEY,
      run: async () => ({ results: await braveSearch(q) }),
    },
    {
      id: "tavily",
      ready: !!process.env.TAVILY_API_KEY,
      run: () => tavilySearch(q),
    },
    {
      id: "serpapi",
      ready: !!process.env.SERPAPI_KEY,
      run: async () => ({ results: await serpSearch(q) }),
    },
    {
      id: "bing",
      ready: !!process.env.BING_API_KEY,
      run: async () => ({ results: await bingSearch(q) }),
    },
  ];

  const ordered = forced
    ? [...attempts.filter((a) => a.id === forced), ...attempts.filter((a) => a.id !== forced)]
    : attempts;

  const failures: string[] = [];

  for (const a of ordered) {
    if (!a.ready) continue;
    try {
      const { results, answer } = await a.run();
      if (!results.length) {
        failures.push(`${a.id}: 无结果`);
        continue;
      }
      const llm = await llmSummarize(q, results);
      // 优先用 LLM 带引用摘要；其次用 Tavily 自带 answer
      const summary = llm?.summary || answer || undefined;
      const sources =
        llm?.sources ||
        (answer ? results.slice(0, 5).map((r, i) => ({ n: i + 1, title: r.title, url: r.url })) : undefined);
      return {
        query: q,
        results,
        fetchedAt,
        provider: a.id,
        ...(summary ? { summary } : {}),
        ...(sources ? { sources } : {}),
      };
    } catch (e) {
      failures.push(`${a.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 全部失败或未配置任何密钥 → 示例数据
  const configured = attempts.some((a) => a.ready);
  return {
    query: q,
    results: mockResults(q),
    fetchedAt,
    provider: "mock",
    note: configured
      ? `真实检索失败（${failures.join("；")}），已展示示例数据。`
      : "未配置 BRAVE_API_KEY / TAVILY_API_KEY / SERPAPI_KEY，当前为示例数据；配置后即为真实全网检索。",
  };
}
