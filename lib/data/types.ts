export type Role = "super" | "editor" | "lead" | "viewer" | "employee";

export type SiteInfo = {
  companyName: string;
  slogan: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  icp: string;
};

export type Admin = { id: string; username: string; role: Role; pwHash: string };

export type Lead = {
  id: string;
  name: string;
  phone: string;
  company: string;
  query: string;
  at: string;
  status: "new" | "contacted";
  note?: string;
};

/**
 * 内容类型：
 * - news 资讯 / product 产品 / solution 解决方案 / case 案例  → 前台展示内容
 * - kb 客服知识库文档
 * - pdoc 产品资料（挂在某个产品/解决方案下的文档，client 存所属条目 id）
 */
export type ContentType = "news" | "product" | "solution" | "case" | "kb" | "pdoc";

/**
 * 统一内容实体：资讯（news）、产品（product）、解决方案（solution）、案例（case）共用。
 * 由后台 CMS 维护；前台按 type 渲染不同页面。
 * 各类型对通用字段的复用约定：
 * - product / solution：tag=分类，industry=适用场景，result=成效亮点，tags=核心能力
 * - case：tag=分类，client=客户名称，industry=所属行业，result=成效指标
 * - kb / pdoc：tag=文件扩展名，client=文件名/所属产品 id，result=字数，body=提取的全文
 */
export type ContentItem = {
  id: string;
  type: ContentType;
  title: string;
  tag: string; // 分类标签，如「智能客服」「金融」
  summary: string; // 简短摘要
  body: string; // 详情正文（支持换行，前台按段落渲染）
  icon: string; // 产品卡片图标（emoji）
  tags: string[]; // 亮点 / 标签（逗号分隔输入，数组存储）
  client: string; // 案例：客户名称；pdoc：所属产品 id
  industry: string; // 案例：所属行业；product/solution：适用场景；pdoc：关联的知识库文档 id
  result: string; // 案例：成效指标；kb/pdoc：字数
  at: string; // 日期（ISO）
  order: number; // 排序
};

// 历史兼容别名
export type NewsItem = ContentItem;

export type SearchLog = { q: string; at: string; ip: string };

export type AuditLog = {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
  ip: string;
  detail?: string;
};

// 历史兼容类型，仅用于旧引用；新代码请使用具体类型。
export type Db = {
  site: SiteInfo;
  admins: Admin[];
  leads: Lead[];
  contents: ContentItem[];
  searchLogs: SearchLog[];
  auditLogs: AuditLog[];
};

export type AuditInput = {
  actor: string;
  action: string;
  target: string;
  ip: string;
  detail?: string;
};

/**
 * 统一数据访问接口：JSON 文件实现（自托管/本地开发）与 Supabase 实现（生产/Serverless）
 * 都遵循此接口，路由层无需感知底层存储差异。
 */
export interface Repo {
  getSite(): Promise<SiteInfo>;
  updateSite(patch: Partial<SiteInfo>): Promise<SiteInfo>;
  getAdmins(): Promise<Admin[]>;
  setAdminPassword(id: string, newPw: string): Promise<boolean>;
  /** 新增账号（管理员或员工）；用户名重复时抛错 */
  addAdmin(input: { username: string; password: string; role: Role }): Promise<Admin>;
  /** 删除账号（用于移除员工账号）；不存在返回 false */
  removeAdmin(id: string): Promise<boolean>;
  addLead(input: Omit<Lead, "id" | "at" | "status">): Promise<Lead>;
  getLeads(): Promise<Lead[]>;
  updateLead(id: string, patch: Partial<Pick<Lead, "status" | "note">>): Promise<Lead | null>;
  getSearchLogs(): Promise<SearchLog[]>;
  addSearchLog(q: string, ip: string): Promise<void>;
  getContents(type?: ContentType): Promise<ContentItem[]>;
  getContent(id: string): Promise<ContentItem | null>;
  saveContents(items: ContentItem[]): Promise<ContentItem[]>;
  getAuditLogs(): Promise<AuditLog[]>;
  appendAudit(input: AuditInput): Promise<void>;
  newId(prefix: string): string;
}
