/**
 * 向 Supabase 补种「解决方案」条目，并整理产品的展示顺序。
 * 用法: node scripts/seed-solutions.mjs "<SUPABASE_SERVICE_ROLE_KEY>" "<SUPABASE_URL>"
 * 说明：仅在 contents 表已有数据时执行；若表为空，应用会自动写入全套种子（含解决方案）。
 */
const key = process.argv[2] || "";
const url = process.argv[3] || "";
if (!key || !url) {
  console.error("用法: node scripts/seed-solutions.mjs <service_role_key> <supabase_url>");
  process.exit(1);
}

const H = {
  apikey: key,
  Authorization: "Bearer " + key,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

const SOLUTIONS = [
  {
    id: "s1",
    type: "solution",
    title: "企业 AI 中台整体方案",
    tag: "AI 中台",
    icon: "🧩",
    summary: "统一模型网关、知识库与业务编排，让多条业务线共用一套 AI 底座。",
    body:
      "面向已经试点过单点 AI 应用的企业，提供可复用的 AI 中台底座。\n统一接入多家大模型并做路由、限流与成本核算，避免各业务线重复建设。\n内置向量知识库、Prompt 编排与效果观测，新场景接入周期从数周缩短到数天。",
    tags: ["模型网关", "统一知识库", "流程编排", "成本核算"],
    client: "",
    industry: "拥有多条业务线、已启动 AI 试点的中大型企业",
    result: "新场景接入周期 -60%",
    at: "2026-04-20",
    order: 5,
  },
  {
    id: "s2",
    type: "solution",
    title: "私有化部署与合规方案",
    tag: "安全合规",
    icon: "🛡️",
    summary: "全栈私有化交付，数据不出内网，满足金融、政务与医疗的强监管要求。",
    body:
      "为强监管行业提供的完整私有化交付方案。\n模型、向量库与应用全部部署在客户内网或专有云，数据全程不出域。\n配套权限分级、操作审计、内容安全围栏与等保合规清单，交付即可迎接外部审计。",
    tags: ["私有化部署", "权限分级", "操作审计", "等保合规"],
    client: "",
    industry: "金融、政务、医疗等强合规行业",
    result: "一次通过等保测评",
    at: "2026-05-08",
    order: 6,
  },
];

(async () => {
  const all = await (
    await fetch(`${url}/rest/v1/contents?select=id,type,title,order`, { headers: H })
  ).json();
  if (!Array.isArray(all)) {
    console.error("读取 contents 失败:", JSON.stringify(all).slice(0, 200));
    process.exit(1);
  }

  // 1) 清理测试残留
  const junk = all.filter((c) => c.title.includes("不该进产品中心") || c.title.includes("临时条目"));
  for (const j of junk) {
    const r = await fetch(`${url}/rest/v1/contents?id=eq.${j.id}`, {
      method: "DELETE",
      headers: { apikey: key, Authorization: "Bearer " + key },
    });
    console.log("清理残留:", j.title, r.status);
  }

  // 2) 产品 + 解决方案重新编号 1..n（保持现有展示顺序）
  const fresh = await (
    await fetch(`${url}/rest/v1/contents?select=id,type,title,order`, { headers: H })
  ).json();
  const items = fresh
    .filter((c) => c.type === "product" || c.type === "solution")
    .sort((a, b) => a.order - b.order);

  // 3) 若缺少解决方案种子则补种（排在产品之后）
  const has = new Set(items.map((i) => i.id));
  let nextOrder = items.length;
  for (const s of SOLUTIONS) {
    if (has.has(s.id)) continue;
    nextOrder += 1;
    const r = await fetch(`${url}/rest/v1/contents`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ ...s, order: nextOrder }),
    });
    console.log("补种解决方案:", s.title, r.status);
    items.push({ id: s.id, type: "solution", title: s.title, order: nextOrder });
  }

  // 4) 顺序归一化为 1..n
  for (let i = 0; i < items.length; i++) {
    const want = i + 1;
    if (items[i].order === want) continue;
    const r = await fetch(`${url}/rest/v1/contents?id=eq.${items[i].id}`, {
      method: "PATCH",
      headers: H,
      body: JSON.stringify({ order: want }),
    });
    console.log(`重排 ${items[i].title}: → ${want}`, r.status);
  }

  const final = await (
    await fetch(`${url}/rest/v1/contents?select=id,type,title,order`, { headers: H })
  ).json();
  console.log(
    "\n最终展示顺序:",
    final
      .filter((c) => c.type === "product" || c.type === "solution")
      .sort((a, b) => a.order - b.order)
      .map((c, n) => `${n + 1}.${c.type === "solution" ? "方案" : "产品"} ${c.title}`)
      .join(" | ")
  );
})();
