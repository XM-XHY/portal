import type { ContentItem, SiteInfo } from "./data/types";
import { brandName } from "./brand";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type Knowledge = {
  site: SiteInfo;
  products: ContentItem[];
  cases: ContentItem[];
  news: ContentItem[];
};

/**
 * 把站点信息 + 产品/案例/资讯压缩为一份"企业知识库"文本，
 * 供 LLM system prompt 与规则引擎共同使用。
 */
export function buildKnowledgeText(k: Knowledge): string {
  const lines: string[] = [];
  lines.push(
    `【公司】${brandName(k.site.companyName)} — ${k.site.slogan}`,
    `【联系方式】联系人 ${k.site.contactName}，电话 ${k.site.phone}，邮箱 ${k.site.email}，地址 ${k.site.address}`,
  );
  lines.push("", "【产品与解决方案】");
  for (const p of k.products) {
    lines.push(`- ${p.title}（id=${p.id}，标签：${p.tag || "—"}）：${p.summary}`);
    if (p.body) lines.push(`  详情：${p.body.slice(0, 200)}`);
  }
  lines.push("", "【客户案例】");
  for (const c of k.cases) {
    lines.push(
      `- ${c.title}（id=${c.id}，行业：${c.industry || c.tag || "—"}${c.client ? `，客户：${c.client}` : ""}）：${c.summary}${c.result ? ` 成效：${c.result}` : ""}`,
    );
  }
  if (k.news.length) {
    lines.push("", "【最新动态】");
    for (const n of k.news) lines.push(`- ${n.title}：${n.summary.slice(0, 80)}`);
  }
  return lines.join("\n");
}

const has = (t: string, words: string[]) => words.some((w) => t.includes(w));

/**
 * 规则引擎：未配置 LLM_API_KEY 时的兜底应答。
 * 基于企业知识库做意图匹配，保证"实际可对话"，但表达固定。
 * 返回 null 表示无法识别（由调用方决定兜底话术）。
 */
export function ruleReply(query: string, k: Knowledge): string | null {
  const t = query.trim();
  const name = brandName(k.site.companyName);

  if (has(t, ["价格", "费用", "多少钱", "报价", "收费", "成本", "预算"])) {
    return [
      `关于价格：我们按需定制方案，费用取决于功能模块、数据规模与部署方式。`,
      ``,
      `大致区间供参考：`,
      `- 标准版（单产品模块）：数万元/年起`,
      `- 企业版（多模块 + 私有化部署）：需评估后报价`,
      ``,
      `你可以留下联系方式，或直接致电 ${k.site.phone}，顾问会在 1 个工作日内给出正式报价。`,
    ].join("\n");
  }

  if (has(t, ["联系", "电话", "邮箱", "地址", "找人", "人工", "电话多少", "怎么找你们"])) {
    return [
      `可以通过以下方式联系${name}：`,
      `- 联系人：${k.site.contactName}`,
      `- 电话：${k.site.phone}`,
      `- 邮箱：${k.site.email}`,
      `- 地址：${k.site.address}`,
      ``,
      `工作日 9:00–18:00 均可联系，也可以在官网任意页面的表单留言，我们会尽快回复。`,
    ].join("\n");
  }

  if (has(t, ["案例", "客户", "落地", "行业", "做过什么", "谁在用", "成功"])) {
    const items = k.cases
      .slice(0, 3)
      .map((c) => `- 《${c.title}》${c.industry ? `（${c.industry}）` : ""}${c.result ? `：${c.result}` : ""}`);
    return [
      `我们已在金融、制造、零售等行业落地：`,
      ...items,
      ``,
      `可在官网"客户案例"页查看完整细节，或告诉我你所在的行业，我帮你找对口案例。`,
    ].join("\n");
  }

  if (has(t, ["客服", "copilot", "对话", "机器人", "工单", "意图"])) {
    const p = k.products.find((x) => (x.title + x.summary + (x.body || "")).toLowerCase().match(/客服|copilot/));
    return [
      p ? `「${p.title}」：${p.summary}` : `智能客服 Copilot：7×24 全天候 AI 客服，自动应答、工单分流与意图识别。`,
      ``,
      `你现在正在体验的就是同款对话能力 🙂 想了解接入方式（网页挂载 / API / 私有化），直接问我，或致电 ${k.site.phone}。`,
    ].join("\n");
  }

  if (has(t, ["获客", "搜索", "找客户", "线索", "营销"])) {
    return [
      `智能获客是我们的核心场景之一：`,
      `- 官网"智能获客"页支持输入关键词全网检索，返回真实来源并自动留资归集；`,
      `- 后台可对线索筛选、打标签、导出 CSV 跟进。`,
      ``,
      `想现在体验？点击顶部导航"智能获客"即可试用。`,
    ].join("\n");
  }

  if (has(t, ["产品", "功能", "能做什么", "做什么", "介绍一下", "方案", "服务"])) {
    const items = k.products.slice(0, 4).map((p) => `- ${p.title}：${p.summary}`);
    return [`我们的产品矩阵：`, ...items, ``, `对哪个感兴趣？告诉我名称，我展开讲。`].join("\n");
  }

  if (has(t, ["公司", "介绍", "关于", "你们是谁", "背景", "规模"])) {
    return [
      `${name} — ${k.site.slogan}。`,
      `我们为企业提供 AI 数字化解决方案：智能获客、智能客服、数据智能与内容管理，支持公有云与私有化部署。`,
      `更多背景见官网"关于我们"，或直接致电 ${k.site.phone} 洽谈。`,
    ].join("\n");
  }

  if (has(t, ["私有化", "部署", "本地", "内网", "安全", "合规", "数据安全"])) {
    return [
      `支持公有云 SaaS 与私有化两种部署：`,
      `- 公有云：开箱即用，按模块订阅；`,
      `- 私有化：部署在客户内网，数据不出域，支持对接企业已有账号体系与审计要求。`,
      ``,
      `具体架构可致电 ${k.site.phone} 与技术顾问沟通。`,
    ].join("\n");
  }

  if (has(t, ["你好", "您好", "hi", "hello", "在吗", "嗨"])) {
    return `你好！我是${name}的 AI 助手，可以为你介绍产品、查询案例、解答合作与价格问题。你想了解什么？`;
  }

  if (has(t, ["谢谢", "感谢", "bye", "再见"])) {
    return `不客气！如需进一步沟通，随时留言或致电 ${k.site.phone}。祝顺利 🙂`;
  }

  return null;
}

export const FALLBACK_REPLY = (k: Knowledge): string =>
  [
    `这个问题我需要更具体的信息才能回答准确。你可以：`,
    `- 告诉我你关心的产品或行业，我展开介绍；`,
    `- 直接致电 ${k.site.phone} 联系${k.site.contactName}；`,
    `- 或在官网表单留下需求，顾问会主动联系你。`,
  ].join("\n");

/** LLM system prompt：基于知识库回答，不许编造 */
export function buildSystemPrompt(k: Knowledge): string {
  return [
    `你是"${brandName(k.site.companyName)}"官网的 AI 客服助手。用简体中文回答，语气专业友好、简洁（一般不超过 180 字）。`,
    `只能依据下面的企业知识库回答；知识库没有的信息要坦白说不确定，并引导用户致电 ${k.site.phone} 或在官网留言，绝不能编造。`,
    `适当引导用户留资（留下联系方式）或查看官网对应页面。不要输出 markdown 标题，可用短列表。`,
    ``,
    `===== 企业知识库 =====`,
    buildKnowledgeText(k),
  ].join("\n");
}
