const features = [
  {
    icon: "🧠",
    title: "大模型应用",
    desc: "接入主流大模型，构建企业专属问答、文档助理与智能客服，安全合规部署。",
  },
  {
    icon: "🌐",
    title: "全网智能获客",
    desc: "访客输入关键词即可全网检索可信信息，实时沉淀销售线索，提升转化。",
  },
  {
    icon: "📊",
    title: "数据洞察中台",
    desc: "可视化看板追踪搜索热词与线索来源，辅助市场决策与投放优化。",
  },
  {
    icon: "🛡️",
    title: "权限与合规",
    desc: "细粒度 RBAC 后台权限，操作审计可追溯，满足企业级安全要求。",
  },
  {
    icon: "📱",
    title: "全端自适应",
    desc: "桌面与移动端一致体验，后台移动可管，随时随地掌控业务。",
  },
  {
    icon: "⚡",
    title: "极速体验",
    desc: "边缘渲染与缓存策略保障首屏与搜索响应，Core Web Vitals 达标。",
  },
];

export default function FeatureCards() {
  return (
    <section id="products" className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold sm:text-4xl">
          一站式 <span className="text-gradient">AI 能力</span> 矩阵
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-slate-400">
          从模型应用到获客转化，把人工智能真正落到业务增长上。
        </p>
      </div>
      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <div
            key={f.title}
            className="glass glass-hover group p-6"
          >
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-white/5 text-2xl transition group-hover:scale-110">
              {f.icon}
            </div>
            <h3 className="mt-4 text-lg font-semibold text-white">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
