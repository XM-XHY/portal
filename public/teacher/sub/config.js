/* ============================================================
 * 在线订阅版前端配置（离线功能已全部移除）
 *  - 静态页部署在企业网站 www.cnxhy.top/teacher/，与后台同域
 *  - apiBase 走网站同域代理 /api/ent → 腾讯云 CloudBase 云函数 ent
 *    （浏览器永远拿不到商户密钥 / 后台共享密钥；也无跨域问题）
 *  - 云函数网关地址只存在于服务端环境变量与运维文档中，绝不下发到浏览器；
 *    前端不存在也不支持「直连云函数」的备用路径（网关 CORS 仅放行站点域名）
 *  - 后台入口 /admin/teacher-sub 由企业网站提供；网站未部署新版时该地址返回 404，
 *    admin.html 会先探测并阻止跳转，改为给出部署指引，不会把用户丢进 404 页面
 *  - 断网即锁定，不存在任何本地放行 / 离线宽限 / 缓存授权
 * ============================================================ */
window.ENT_CONFIG = {
  apiBase: '/api/ent',
  enforce: true,
  offlineAllowed: false,
  priceFen: 2000,
  priceText: '20 元 / 月',
  trialDays: 7,
  siteBase: 'https://www.cnxhy.top',
  appUrl: 'https://www.cnxhy.top/teacher/',
  accountUrl: 'account.html',
  adminUrl: 'https://www.cnxhy.top/admin/teacher-sub',
  /* 本地预览时可选：企业网站 npm run dev 的后台地址（仅开发用，不影响线上） */
  localAdminUrl: 'http://localhost:3100/admin/teacher-sub',
  showEntry: true,
  heartbeatMs: 5 * 60 * 1000,
  storageKey: 'twb_ent_session',
  workspaceKey: 'universal_teacher_workbench_v1',
  syncDebounceMs: 1500,
  syncEnabled: true
};
