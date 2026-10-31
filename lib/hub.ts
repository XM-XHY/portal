/**
 * 企业知识中枢（/hub）服务端逻辑：
 * 员工登录后可浏览知识库材料，并通过对话让 AI 基于知识库起草材料。
 */
import type { ContentItem } from "./data/types";
import type { KbHit } from "./kb";

export type HubDoc = Pick<
  ContentItem,
  "id" | "title" | "tag" | "summary" | "icon" | "result" | "at"
>;

export function toHubDoc(d: ContentItem): HubDoc {
  return {
    id: d.id,
    title: d.title,
    tag: d.tag,
    summary: d.summary,
    icon: d.icon || docIconOf(d.tag),
    result: d.result, // 字数
    at: d.at,
  };
}

export function docIconOf(ext: string): string {
  const m: Record<string, string> = {
    docx: "📝", doc: "📝", xlsx: "📊", xls: "📊", csv: "📊",
    pdf: "📕", txt: "📄", md: "📄",
  };
  return m[(ext || "").toLowerCase()] || "📄";
}

/** 材料生成的 LLM system prompt：严格依据知识库起草，不编造 */
export function buildMaterialPrompt(
  company: string,
  question: string,
  hits: KbHit[]
): string {
  const kbText = hits
    .map((h, i) => `[资料${i + 1}]（来自《${h.doc.title}》）\n${h.chunk}`)
    .join("\n\n");

  return [
    `你是「${company}」企业知识中枢的材料生成助手，服务对象是公司内部员工。`,
    `员工会提出写作或整理需求（如通知、方案、总结、FAQ、培训材料、回复话术等）。`,
    ``,
    `要求：`,
    `1. 只能依据下面的企业知识库资料起草；资料没有的信息不要编造，可在文末「待补充」中列出。`,
    `2. 输出一份可直接使用的材料正文，使用 Markdown 格式（以 # 一级标题开始），语言简体中文、正式得体。`,
    `3. 内容要完整成文（通常 300-800 字），不要解释你的工作过程，不要寒暄。`,
    `4. 文末附「---」分隔线与「依据资料：」列表。`,
    ``,
    `===== 员工需求 =====`,
    question,
    ``,
    `===== 企业知识库资料 =====`,
    kbText || "（未检索到相关资料，请基于常识性公文结构给出模板，并在文末注明需人工补充公司信息）",
  ].join("\n");
}

/**
 * 未配置大模型时的兜底：把知识库命中片段整理成一份结构化材料草稿。
 */
export function fallbackMaterial(
  question: string,
  hits: KbHit[],
  company: string
): { title: string; content: string } {
  const title = question.replace(/\s+/g, " ").slice(0, 40) || "知识库整理材料";
  const sources = Array.from(new Set(hits.map((h) => h.doc.title)));

  if (!hits.length) {
    return {
      title,
      content: [
        `# ${title}`,
        ``,
        `> 知识库中暂未检索到与该需求直接相关的资料，以下为通用框架，请结合公司实际情况补充。`,
        ``,
        `## 背景与目的`,
        `- （说明本次事项的背景与要达成的目标）`,
        ``,
        `## 具体安排 / 要点`,
        `- （要点一）`,
        `- （要点二）`,
        ``,
        `## 相关要求`,
        `- （时间、责任人、注意事项）`,
        ``,
        `---`,
        `依据资料：暂无（建议管理员先在后台导入相关文档）`,
      ].join("\n"),
    };
  }

  const points = hits.slice(0, 4).map((h, i) => {
    const text = h.chunk.trim().replace(/\n+/g, "\n");
    return `### 要点 ${i + 1}（来自《${h.doc.title}》）\n${text}`;
  });

  return {
    title,
    content: [
      `# ${title}`,
      ``,
      `> 本材料由${company}企业知识中枢依据知识库自动整理生成，请结合实际情况审阅修订后使用。`,
      ``,
      ...points,
      ``,
      `---`,
      `依据资料：${sources.map((s) => `《${s}》`).join("、")}`,
    ].join("\n"),
  };
}
