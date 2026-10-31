import { hash } from "./hash";
import type { SiteInfo, Admin, ContentItem } from "./types";

export function defaultSite(): SiteInfo {
  return {
    companyName: "XX 科技",
    slogan: "用 AI 重塑企业增长",
    contactName: "张先生",
    phone: "400-000-0000",
    email: "bd@xx-tech.com",
    address: "深圳市南山区科技园",
    icp: "粤ICP备00000000号",
  };
}

// 初识管理员口令。已按用户要求统一为强口令（见 .env.example 说明）。
// ⚠️ 站点已公网可访问，上线后请在「后台 → 账号安全」再次修改，或接入身份服务。
export function defaultAdmins(): Admin[] {
  return [
    { id: "a1", username: "admin", role: "super", pwHash: hash("#XHY-@350211") },
    { id: "a2", username: "market", role: "lead", pwHash: hash("#XHY-@350211") },
  ];
}

export function defaultContents(): ContentItem[] {
  return [
    // ---------- 产品 / 解决方案 ----------
    {
      id: "p1",
      type: "product",
      title: "智能客服 Copilot",
      tag: "智能客服",
      icon: "💬",
      summary: "7×24 全天候 AI 客服，自动应答、工单分流与意图识别，转化率提升 40%。",
      body:
        "基于大模型与知识库检索（RAG）构建的企业级智能客服。\n支持多渠道接入（网页、微信、App），自动识别用户意图并给出准确答复，复杂问题无缝转人工。\n内置情绪识别与满意度回访，持续优化服务质量。",
      tags: ["大模型", "知识库RAG", "多渠道", "工单分流"],
      client: "",
      industry: "",
      result: "响应时长 -70%",
      at: "2026-01-10",
      order: 1,
    },
    {
      id: "p2",
      type: "product",
      title: "企业知识中枢",
      tag: "知识管理",
      icon: "📚",
      summary: "统一沉淀文档、制度与经验，员工一句话即可检索全公司知识资产。",
      body:
        "将分散在各处的文档、Wiki、聊天记录与表格统一向量化入库。\n提供自然语言问答与引用溯源，确保每一条答案都可追溯出处，避免幻觉。\n权限细粒度管控，敏感知识仅对授权人员开放。",
      tags: ["向量检索", "权限隔离", "引用溯源", "私有部署"],
      client: "",
      industry: "",
      result: "知识检索效率 ×5",
      at: "2026-02-15",
      order: 2,
    },
    {
      id: "p3",
      type: "product",
      title: "智能获客中台",
      tag: "营销增长",
      icon: "🚀",
      summary: "访客输入关键词即可全网检索可信信息，实时沉淀销售线索。",
      body:
        "面向市场与销售团队的获客引擎。\n访客在官网输入任意关键词，系统调用 Bing 等搜索引擎聚合权威结果，并由大模型生成带引用的摘要。\n每次搜索自动沉淀为销售线索，附带关键词标签，便于精准跟进与转化分析。",
      tags: ["全网检索", "线索沉淀", "LLM摘要", "转化分析"],
      client: "",
      industry: "",
      result: "线索获取 +120%",
      at: "2026-03-20",
      order: 3,
    },
    {
      id: "p4",
      type: "product",
      title: "数据洞察看板",
      tag: "数据分析",
      icon: "📊",
      summary: "可视化追踪搜索热词与线索来源，辅助市场决策与投放优化。",
      body:
        "将搜索日志、线索与转化数据统一汇聚为实时看板。\n提供热门搜索词、趋势曲线与来源分布等多维视图，帮助市场团队快速定位高价值需求与优化投放方向。",
      tags: ["实时看板", "热词分析", "来源归因", "决策辅助"],
      client: "",
      industry: "",
      result: "决策周期 -50%",
      at: "2026-04-05",
      order: 4,
    },
    // ---------- 客户案例 ----------
    {
      id: "c1",
      type: "case",
      title: "某头部银行智能客服升级",
      tag: "金融",
      icon: "🏦",
      summary: "引入智能客服 Copilot，高峰时段人工压力下降 60%。",
      body:
        "客户为国内某头部股份制银行，客服中心日均咨询量超 10 万次。\n我们为其部署智能客服 Copilot，对接既有知识库与业务系统，实现账户、理财、风控等场景的自动应答。\n复杂业务通过意图识别精准转接对应坐席，整体服务效率显著提升。",
      tags: ["智能客服", "金融合规", "私有部署"],
      client: "某头部股份制银行",
      industry: "金融",
      result: "人工压力 -60%",
      at: "2026-05-12",
      order: 1,
    },
    {
      id: "c2",
      type: "case",
      title: "制造业知识中枢落地",
      tag: "制造",
      icon: "🏭",
      summary: "为大型装备制造商搭建知识中枢，新员工培训周期缩短一半。",
      body:
        "客户为大型高端装备制造商，技术文档与工艺标准分散在数十个系统中。\n我们构建企业知识中枢，统一向量化入库，工程师通过自然语言即可检索图纸、工艺与故障处理经验，并附引用溯源。\n显著降低了对资深专家的依赖。",
      tags: ["知识管理", "向量检索", "培训提效"],
      client: "某大型装备制造商",
      industry: "制造",
      result: "培训周期 -50%",
      at: "2026-06-18",
      order: 2,
    },
    {
      id: "c3",
      type: "case",
      title: "零售连锁智能获客",
      tag: "零售",
      icon: "🛍️",
      summary: "智能获客中台帮助连锁品牌线索量翻倍，获客成本下降 35%。",
      body:
        "客户为全国连锁零售品牌，线上流量分散、线索跟进滞后。\n通过智能获客中台，官网访客输入需求关键词即可获得个性化方案与权威信息，搜索行为实时转化为销售线索。\n市场团队基于热词与来源分析优化投放，ROI 明显提升。",
      tags: ["智能获客", "线索转化", "投放优化"],
      client: "某全国连锁零售品牌",
      industry: "零售",
      result: "获客成本 -35%",
      at: "2026-07-22",
      order: 3,
    },
    // ---------- 资讯 / 观点 ----------
    {
      id: "n1",
      type: "news",
      title: "大模型选型白皮书",
      tag: "资讯",
      icon: "📘",
      summary: "2026 企业落地指南，覆盖成本、架构与上线路径。",
      body: "本报告系统梳理主流大模型的能力与成本差异，给出企业从试点到规模化落地的架构建议与上线路径，涵盖私有化、混合部署与安全合规要点。",
      tags: ["大模型", "白皮书"],
      client: "",
      industry: "",
      result: "",
      at: "2026-08-01",
      order: 1,
    },
    {
      id: "n2",
      type: "news",
      title: "AI 获客实战方法论",
      tag: "案例",
      icon: "🧭",
      summary: "从关键词到成交的全流程方法论。",
      body: "结合多个行业交付经验，拆解智能获客从流量承接、意图识别、内容生成到销售跟进的完整链路，提供可复用的运营框架与指标体系。",
      tags: ["获客", "方法论"],
      client: "",
      industry: "",
      result: "",
      at: "2026-09-10",
      order: 2,
    },
    {
      id: "n3",
      type: "news",
      title: "生成式 AI 数据合规解读",
      tag: "观点",
      icon: "⚖️",
      summary: "生成式 AI 在企业应用中的数据与版权边界。",
      body: "解读企业应用生成式 AI 时的数据合规与版权风险，强调「只摘要+原文链接」的聚合模式与私有化部署在合规上的优势，给出落地建议。",
      tags: ["合规", "版权", "观点"],
      client: "",
      industry: "",
      result: "",
      at: "2026-10-15",
      order: 3,
    },
  ];
}
