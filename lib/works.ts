/**
 * 作品中心数据源。
 *
 * 「作品」指数字员工制作空间产出的、可直接在线体验的成品应用。
 *
 * 关键约定：作品文件放在 `assets/works/`，**不放 `public/`**。
 * public 下的文件是可直接访问和下载的静态资源，任何人拿到 URL 就能保存整个包、
 * 再拆掉包内门禁；改由 `/api/works/[id]` 按需输出后，可以只允许白名单 id、
 * 禁止缓存、并加上 noindex，避免整包被搜索引擎和 CDN 收录成公开副本。
 *
 * 新增作品：把 HTML 放进 assets/works/，在这里追加一条记录即可，
 * 页面与接口都会自动识别（接口靠 id 白名单做路径校验，不拼接用户输入）。
 */

export type WorkHighlight = {
  title: string;
  desc: string;
};

export type Work = {
  /** 路由与文件名标识，仅允许小写字母、数字与连字符 */
  id: string;
  name: string;
  subtitle: string;
  summary: string;
  tags: string[];
  highlights: WorkHighlight[];
  coverage: string[];
  /** assets/works 下的文件名 */
  file: string;
  /** 用于展示的更新时间 */
  updatedAt: string;
  /** 体验门槛说明，与包内门禁保持一致 */
  accessNote: string;
};

export const WORKS: Work[] = [
  {
    id: "quanke",
    name: "全科提分导师",
    subtitle: "9 大学科一站式 AI 学习助手（小学 · 初中 · 高中）",
    summary:
      "面向小学到高中的全学科提分数字员工：录入成绩、定位薄弱点、分层出题、批改作业、生成学情周报，一部手机就能完整跑通。",
    tags: ["数字员工", "教育科技", "9 大学科", "小学·初中·高中", "拍照 OCR", "云端同步"],
    highlights: [
      { title: "成绩录入", desc: "按科目、章节批量录入，自动归集为可分析的学情数据。" },
      { title: "薄弱点 Top 3", desc: "从错题分布里算出最该先补的三个知识点，不做平均用力。" },
      { title: "分层出题", desc: "按掌握度自动分基础 / 提升 / 拔高三个层次出题，避免一锅端。" },
      { title: "作业批改", desc: "拍下作业自动识别并批改，错题直接进错题库。" },
      { title: "学情周报", desc: "一周学习情况自动成文，家长可直接查看与转发。" },
      { title: "真题特训", desc: "按考纲筛选真题组卷，限时训练后立即出得分分析。" },
      { title: "专题专练", desc: "针对单一薄弱专题集中突破，练完即回到掌握度看板。" },
    ],
    coverage: [
      "数学 · 语文 · 英语 · 物理 · 化学",
      "生物 · 地理 · 历史 · 政治",
      "小学 + 初中 + 高中全学段",
      "人教 / 北师大 / 苏科等多教材版本",
      "中高考双线备考：基础 / 变式 / 拔高三档",
    ],
    file: "quanke.html",
    updatedAt: "2026-11-05",
    accessNote:
      "在线体验版内置 7 天免费试用；会员开通在体验页内完成，走本站微信支付。账号、错题与学习数据保存在本站服务端数据库，换设备登录后自动同步，也可随时导出。",
  },
];

/** 按 id 取作品。找不到返回 undefined —— 调用方必须自行处理 404 */
export function getWork(id: string): Work | undefined {
  return WORKS.find((w) => w.id === id);
}
