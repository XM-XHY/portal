-- ============================================================
-- XX 科技门户 — Supabase 数据库结构
-- 适用：生产环境 / Serverless（Vercel 等）部署。
-- 用法：在 Supabase 控制台 → SQL Editor 中全量执行本文件。
-- 然后在前端 .env 配置 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY，
-- 应用会自动切换到 Supabase 存储（无需改代码）。
-- ============================================================

-- 站点信息（单行，id 固定为 1，由后台"站点设置"维护）
create table if not exists site_info (
  id int primary key default 1,
  company_name text not null default '',
  slogan text not null default '',
  contact_name text not null default '',
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  icp text not null default '',
  updated_at timestamptz not null default now()
);

-- 管理员账号（密码为 sha256(SALT+pw)，与 JSON 存储同一套，可平滑切换）
create table if not exists admins (
  id text primary key,
  username text unique not null,
  role text not null,
  pw_hash text not null,
  -- 逐账号权限覆盖：为 NULL 时沿用角色默认权限；写入具体数组时覆盖角色默认
  perms jsonb
);

-- 获客线索（访客公开提交）
create table if not exists leads (
  id text primary key default gen_random_uuid()::text,
  name text not null default '',
  phone text not null default '',
  company text not null default '',
  query text not null default '',
  at timestamptz not null default now(),
  status text not null default 'new',
  note text not null default ''
);
create index if not exists leads_at_idx on leads (at desc);

-- 内容（资讯 / 产品 / 解决方案 / 案例 / 知识库文档 / 产品资料），由后台 CMS 维护
create table if not exists contents (
  id text primary key,
  type text not null default 'news',
  title text not null default '',
  tag text not null default '',
  summary text not null default '',
  body text not null default '',
  icon text not null default '📄',
  tags text[] not null default '{}',
  client text not null default '',
  industry text not null default '',
  result text not null default '',
  at text not null default '',
  "order" int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists contents_type_idx on contents (type);
create index if not exists contents_order_idx on contents ("order" asc);

-- 搜索日志（获客分析）
create table if not exists search_logs (
  id bigint generated always as identity primary key,
  q text not null default '',
  at timestamptz not null default now(),
  ip text not null default ''
);
create index if not exists search_logs_at_idx on search_logs (at desc);

-- 操作审计日志
create table if not exists audit_logs (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor text not null default '',
  action text not null default '',
  target text not null default '',
  ip text not null default '',
  detail text not null default ''
);
create index if not exists audit_logs_at_idx on audit_logs (at desc);

-- ============================================================
-- 初始数据
-- ============================================================

-- 站点默认值
insert into site_info (id, company_name, slogan, contact_name, phone, email, address, icp)
values (1, 'XX 科技', '用 AI 重塑企业增长', '张先生', '400-000-0000', 'bd@xx-tech.com', '深圳市南山区科技园', '粤ICP备00000000号')
on conflict (id) do nothing;

-- 管理员默认账号（口令与后台登录页帮助文本、.env.example 一致）。
-- 生产务必通过后台"账号安全"修改密码，或在此替换为你的强口令哈希。
-- 哈希算法：sha256('xx-tech-static-salt-v1' + 明文口令)
insert into admins (id, username, role, pw_hash) values
  ('a1', 'admin',  'super', 'cef30ce13b6c2f133c1feb19497efc1442b667c8e90e5da7a1230cfd0247db35'),
  ('a2', 'market', 'lead',  'cef30ce13b6c2f133c1feb19497efc1442b667c8e90e5da7a1230cfd0247db35')
on conflict (id) do update set pw_hash = excluded.pw_hash;

-- 内容初始示例（与 lib/data/defaults.ts 保持一致）
insert into contents (id, type, title, tag, summary, body, icon, tags, client, industry, result, at, "order") values
  ('p1', 'product', '智能客服 Copilot', '智能客服', '7×24 全天候 AI 客服，自动应答、工单分流与意图识别，转化率提升 40%。', '基于大模型与知识库检索（RAG）构建的企业级智能客服。', '💬', array['大模型','知识库RAG','多渠道','工单分流'], '', '', '响应时长 -70%', '2026-01-10', 1),
  ('p2', 'product', '企业知识中枢', '知识管理', '统一沉淀文档、制度与经验，员工一句话即可检索全公司知识资产。', '将分散在各处的文档、Wiki、聊天记录与表格统一向量化入库。', '📚', array['向量检索','权限隔离','引用溯源','私有部署'], '', '', '知识检索效率 ×5', '2026-02-15', 2),
  ('p3', 'product', '智能获客中台', '营销增长', '访客输入关键词即可全网检索可信信息，实时沉淀销售线索。', '面向市场与销售团队的获客引擎，调用搜索引擎聚合权威结果并由大模型生成带引用的摘要。', '🚀', array['全网检索','线索沉淀','LLM摘要','转化分析'], '', '', '线索获取 +120%', '2026-03-20', 3),
  ('p4', 'product', '数据洞察看板', '数据分析', '可视化追踪搜索热词与线索来源，辅助市场决策与投放优化。', '将搜索日志、线索与转化数据统一汇聚为实时看板。', '📊', array['实时看板','热词分析','来源归因','决策辅助'], '', '', '决策周期 -50%', '2026-04-05', 4),
  ('s1', 'solution', '企业 AI 中台整体方案', 'AI 中台', '统一模型网关、知识库与业务编排，让多条业务线共用一套 AI 底座。', '面向已经试点过单点 AI 应用的企业，提供可复用的 AI 中台底座。', '🧩', array['模型网关','统一知识库','流程编排','成本核算'], '', '拥有多条业务线、已启动 AI 试点的中大型企业', '新场景接入周期 -60%', '2026-04-20', 5),
  ('s2', 'solution', '私有化部署与合规方案', '安全合规', '全栈私有化交付，数据不出内网，满足金融、政务与医疗的强监管要求。', '为强监管行业提供的完整私有化交付方案。', '🛡️', array['私有化部署','权限分级','操作审计','等保合规'], '', '金融、政务、医疗等强合规行业', '一次通过等保测评', '2026-05-08', 6),
  ('c1', 'case', '某头部银行智能客服升级', '金融', '引入智能客服 Copilot，高峰时段人工压力下降 60%。', '客户为国内某头部股份制银行，客服中心日均咨询量超 10 万次。', '🏦', array['智能客服','金融合规','私有部署'], '某头部股份制银行', '金融', '人工压力 -60%', '2026-05-12', 1),
  ('c2', 'case', '制造业知识中枢落地', '制造', '为大型装备制造商搭建知识中枢，新员工培训周期缩短一半。', '客户为大型高端装备制造商，技术文档与工艺标准分散在数十个系统中。', '🏭', array['知识管理','向量检索','培训提效'], '某大型装备制造商', '制造', '培训周期 -50%', '2026-06-18', 2),
  ('c3', 'case', '零售连锁智能获客', '零售', '智能获客中台帮助连锁品牌线索量翻倍，获客成本下降 35%。', '客户为全国连锁零售品牌，线上流量分散、线索跟进滞后。', '🛍️', array['智能获客','线索转化','投放优化'], '某全国连锁零售品牌', '零售', '获客成本 -35%', '2026-07-22', 3),
  ('n1', 'news', '大模型选型白皮书', '资讯', '2026 企业落地指南，覆盖成本、架构与上线路径。', '本报告系统梳理主流大模型的能力与成本差异，给出企业从试点到规模化落地的架构建议。', '📘', array['大模型','白皮书'], '', '', '', '2026-08-01', 1),
  ('n2', 'news', 'AI 获客实战方法论', '案例', '从关键词到成交的全流程方法论。', '结合多个行业交付经验，拆解智能获客从流量承接、意图识别、内容生成到销售跟进的完整链路。', '🧭', array['获客','方法论'], '', '', '', '2026-09-10', 2),
  ('n3', 'news', '生成式 AI 数据合规解读', '观点', '生成式 AI 在企业应用中的数据与版权边界。', '解读企业应用生成式 AI 时的数据合规与版权风险，强调聚合模式与私有化部署的合规优势。', '⚖️', array['合规','版权','观点'], '', '', '', '2026-10-15', 3)
on conflict (id) do nothing;

-- ============================================================
-- 行级安全（RLS）提示
-- 应用使用 SERVICE_ROLE_KEY 直连（绕过 RLS），因此此处无需为匿名/认证角色开表权限。
-- 若你改为使用 ANON_KEY 或 Supabase Auth，请在此另行配置 RLS 策略。
-- ============================================================
