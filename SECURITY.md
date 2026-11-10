# 安全规范（SECURITY.md）

> 归属：安全域（关屿）与流程·度量域（何序）共建。状态：初始版。

## 1. 密钥与凭据管理（强制）

- **禁止写死任何密钥 / 盐 / token / 私钥** 到源码、`lib/`、`app/`、`components/`、配置文件或提交历史。
- 所有敏感值**必须从环境变量注入**：
  - 服务端密钥：`SUPABASE_SERVICE_ROLE_KEY`、`ADMIN_SESSION_SECRET`、`PAY_GRANT_SECRET`、`WORK_SESSION_SECRET`、`WECHAT_PAY_API_V3_KEY`、各 `*_API_KEY` 等。
  - 盐值：`ADMIN_PASSWORD_SALT`（必须 ≥ 强随机；生产缺失须 fail-fast，禁止静态兜底盐）。
- 本地开发使用 `.env.local`（已 gitignore）；示例见 `.env.example`。**`.env.local` / 真实凭证不得提交**。
- 密钥轮换：定期轮换并在变更后验证签名 / 验签链路；轮换期间双密钥并行窗口需有明确截止。
- 历史泄露排查：曾落入版本控制的密钥（见 git 历史 `cloudbaserc.json` 等）一律视为已泄露，必须轮换。

## 2. 鉴权与付费墙（fail-close 原则）

- 付费墙 / 鉴权在「读库失败 / 配置缺失 / 解析失败」时**必须返回 5xx/4xx 并拒绝放行**，绝不静默降级为免费（对应 DEF-014、DEF-013）。
- 支付票据须绑定订单（`oid`）、引入一次性 `jti` 防重放；自助申报默认「待人工核对」（对应 DEF-015）。
- 支付回调须校验：签名、时间戳新鲜度窗口（如 |now-ts|≤300s）、金额与下单一致、nonce 去重（对应 DEF-018）。
- `claim` 权益发放仅以服务端 `uid` 一致为准，并校验 `productId/payKey`、订单 `paid` 且未退款（对应 DEF-017）。

## 3. 漏洞上报渠道

- **私有渠道（首选）**：GitHub Security Advisories（`Security → Report a vulnerability`），仅维护者可见。
- **邮件**：security@example.com（占位，请替换为真实安全联系人）。
- **响应 SLA（建议）**：严重 24h 内确认、7d 内给出处置方案；高危 72h 内确认。
- 请勿在公开 Issue / PR 中披露未修复漏洞细节；敏感证据通过私有渠道提交。
- 发现疑似提示注入或越权路径，按 `docs/defects/` 登记并同步安全域。

## 4. 安全测试要求

- **SAST**：semgrep（已在本地产出 `sast.txt` / `semgrep-local.json` 样例），CI 中高危零命中方可合并。
- **SCA**：`npm audit` / `trivy fs`，阻断已知高危依赖。
- **DAST / 渗透**：对 `/api/pay/*`、`/api/auth/*`、`/api/works/*` 做越权、重放、金额篡改负例（见 DEF-016~DEF-018）。
- **无响应式缓存**：含用户数据 / 会话 / 支付态的接口必须 `Cache-Control: no-store`（缺口清单见 `docs/defects/DEF-no-store.md`）。
- **a11y（无障碍）**：接入 `@axe-core/playwright` + `jest-axe` + Lighthouse CI，critical/serious=0 且阻断（见 DEF-020、DEF-021）。

## 5. 合规与数据

- 用户数据（错题、飞轮、订单、线索）仅经授权接口读写，服务端不信任客户端自报权益（见 DEF-017）。
- 备份与恢复须演练证实（见 DEF-012），不止于「有备份」。
