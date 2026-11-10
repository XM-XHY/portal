// 知识中枢「我的材料」：AI 生成结果持久化，复用 contents 表（零 DDL）。
// 原来生成结果只在前端 state 里，刷新页面即丢失，也没有历史可查。
import { getContents, saveContents, deleteContents, newId } from "@/lib/store";
import type { ContentItem, ContentType } from "@/lib/data/types";

export const HUB_MATERIAL_TYPE: ContentType = "hub_material";

export type HubMaterial = {
  id: string;
  title: string;
  content: string;
  question: string;
  sources?: string[];
  engine?: string;
  owner: string;
  at: string;
};

function fromItem(c: ContentItem): HubMaterial | null {
  try {
    const m = JSON.parse(c.body) as HubMaterial;
    return m && m.content ? { ...m, id: c.id, owner: m.owner || c.client || "" } : null;
  } catch {
    return null;
  }
}

export async function saveHubMaterial(input: {
  title: string;
  content: string;
  question: string;
  sources?: string[];
  engine?: string;
  owner: string;
}): Promise<HubMaterial> {
  const at = new Date().toISOString();
  const m: HubMaterial = {
    id: newId("hm"),
    title: input.title.slice(0, 120),
    content: input.content,
    question: input.question.slice(0, 2000),
    sources: input.sources,
    engine: input.engine,
    owner: input.owner,
    at,
  };
  const item: ContentItem = {
    id: m.id,
    type: HUB_MATERIAL_TYPE,
    title: m.title,
    tag: m.engine || "material",
    summary: m.question.slice(0, 200),
    body: JSON.stringify(m),
    icon: "📝",
    tags: m.sources || [],
    client: m.owner,
    industry: "",
    result: String(m.content.length),
    at,
    order: 0,
  };
  await saveContents([item]);
  return m;
}

/** 只列当前账号的材料，按时间倒序；不返回正文，避免一次拉回大量文本 */
export async function listHubMaterials(owner: string, limit = 50): Promise<HubMaterial[]> {
  const list = await getContents(HUB_MATERIAL_TYPE);
  return list
    .map(fromItem)
    .filter((m): m is HubMaterial => !!m && m.owner === owner)
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, limit)
    .map((m) => ({ ...m, content: "" }));
}

export async function getHubMaterial(id: string, owner: string): Promise<HubMaterial | null> {
  const list = await getContents(HUB_MATERIAL_TYPE);
  const item = list.find((c) => c.id === id);
  const m = item ? fromItem(item) : null;
  if (!m || m.owner !== owner) return null;
  return m;
}

export async function deleteHubMaterial(id: string, owner: string): Promise<boolean> {
  const m = await getHubMaterial(id, owner);
  if (!m) return false;
  await deleteContents([id]);
  return true;
}
