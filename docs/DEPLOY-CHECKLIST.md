# 上线前检查清单（Release Checklist）

> 本清单把「上线必须做的事」固化下来。任一项未完成不得发布。
> 自动化部分用 `node scripts/preflight-check.mjs` 执行；本文件保留必须由人判断的步骤。

---

## 0. 一句话说明本次上线的关键变化

1. **安全收紧（阻塞性）**：生产环境缺少密钥时应用会 **fail-fast 拒绝启动**。这不是 bug，是设计。
2. **依赖替换**：`xlsx@0.18.5`（high，无官方修复版）已整体替换为 `exceljs`，统一收敛在 `lib/sheet.ts`。
3. **付费墙改为 fail-closed**：只有后台「明确配置为免费」的商品才免费，其余一律需有效票据。

---

## 1. 本地门禁（部署前必须全绿）

```bash
node scripts/preflight-check.mjs      # 期望：FAIL 0
npx tsc --noEmit                      # 期望：exit 0
npx vitest run                        # 期望：全绿
node tests/smoke/run.mjs              # 期望：exit 0
node tests/regression/run.mjs         # 期望：exit 0
node tests/contract/verify.mjs        # 期望：exit 0
```

- [ ] 上述全部通过
- [ ] `git status` 确认**没有把 `.env.secrets.local` 纳入提交**（该文件已被 `.env*.local` 忽略）

---

## 2. 生产环境变量注入（CloudBase 云托管）

服务：`xm-tech-portal`　环境：`xm-xhy-d6gct2tdec159c251`

### 2.1 线上现状（2026-11-05 核对，共 22 项，均已配置）

```
SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ADMIN_SESSION_SECRET / SEARCH_MKT
PAY_PROVIDER / PAY_NOTIFY_BASE
WECHAT_PAY_MCH_ID / WECHAT_PAY_APP_ID / WECHAT_PAY_API_V3_KEY / WECHAT_PAY_SERIAL
WECHAT_PAY_PRIVATE_KEY_FILE / WECHAT_PAY_PUBKEY_ID / WECHAT_PAY_PUBKEY_FILE
ZHIPU_API_KEY / BOCHA_API_KEY / LLM_PROVIDER / LLM_MODEL / SEARCH_PROVIDER
WECHAT_MP_TOKEN / WECHAT_MP_APPID / WECHAT_MP_APPSECRET
CLOUDBASE_PG_API_KEY
```

### 2.2 本次必须新增（否则新版本起不来或鉴权不可用）

| 变量 | 现状 | 缺失后果 |
|---|---|---|
| `ADMIN_PASSWORD_SALT` | **缺失** | **运行期用到口令哈希/会话签发时抛错**（FAIL 级） |
| `PAY_GRANT_SECRET` | 缺失 | 回落 `ADMIN_SESSION_SECRET`，可用但密钥未分离 |
| `WORK_SESSION_SECRET` | 缺失 | 回落 `ADMIN_SESSION_SECRET`，可用但密钥未分离 |
| `INITIAL_ADMIN_PASSWORD` | 缺失 | 仅影响全新空库首次播种；已有库无影响 |

- [ ] 从 `.env.secrets.local` 取出对应值，逐条填入服务环境变量
- [ ] 值只经控制台/API 传递，**不要贴进聊天记录、issue、提交信息**
- [ ] 注入时保留原有 22 项（`envParamsReplaceAll=false` 语义是合并，不是覆盖）

> ℹ️ **密钥解析时机（2026-11-10 修复）**：四个密钥模块（口令盐 / 后台会话 / 作品会话 /
> 付费票据）改为**惰性求值** —— 只有真正用到该密钥的那一刻才解析。
> 因此「构建期」（`next build`，云托管只在容器运行时注入环境变量）不再因缺密钥而崩溃，
> 源码构建可以正常通过；**运行期**缺密钥依然 fail-fast 抛错，绝不回退到静态弱密钥。
>
> ⚠️ **换盐的连锁效应**：`ADMIN_PASSWORD_SALT` 一旦从旧静态值换成新随机值，
> 库中所有 `pw_hash` 立即失效，**后台将无法登录**。
> 本次修复已内置**旧盐回退校验**（仅校验存量哈希，不用于任何新写入），
> 存量 4 个管理员（admin / market / tao / lin）换盐后仍可登录；
> 但**仍建议执行第 4 节第 1 步重算口令**（把弱盐哈希彻底换成新盐哈希）。
> 全部重算完成后，可设置 `ADMIN_PASSWORD_LEGACY_COMPAT=off` 关闭回退校验。

---

## 3. 发布

- [ ] 确认当前分支的待发布内容 = 本次审查修复 + 你自己的业务改动（混在一起要清楚边界）
- [ ] 触发部署（CloudBase 云托管 → `xm-tech-portal` → 源码部署）
- [ ] 等待版本达到 100% 流量，状态 `normal`
- [ ] 若启动失败，先看容器日志确认是否为「缺密钥 fail-fast」，而不是回滚

---

## 4. 发布后立即执行（不可跳过）

### 4.1 重算管理员口令哈希（换盐后必做）

```bash
export CLOUDBASE_ENV_ID=xm-xhy-d6gct2tdec159c251
export CLOUDBASE_PG_API_KEY=<线上库 API Key>
export ADMIN_PASSWORD_SALT=<与生产完全一致的盐>
export TARGET_USER=admin
export NEW_ADMIN_PASSWORD=<新口令>
node scripts/rotate-admin-password.mjs           # 先预演（只读）
node scripts/rotate-admin-password.mjs --apply    # 再实际写入
```

- [ ] `admin`（super）已重算
- [ ] `market`（lead）已重算（口令另设，不要与 admin 相同）
- [ ] `tao` / `lin` 已重算（若仍使用旧盐哈希，靠回退校验登录，重算后彻底换新盐）
- [ ] 用新口令登录后台成功
- [ ] （可选，全部重算后）设置 `ADMIN_PASSWORD_LEGACY_COMPAT=off` 关闭旧盐回退校验

### 4.2 功能验证

- [ ] 首页 / 作品中心 / 分班查询 / 排课 可正常打开
- [ ] 后台登录成功，权限菜单正常
- [ ] **付费下载**：未付费点下载应被拦截（402），付费后成功
- [ ] **导出 Excel**：课表导出 / 均衡分班导出能下载并用 Excel 打开（本轮由 xlsx 换成 exceljs，这是重点回归项）
- [ ] **上传解析**：上传 `.xlsx` / `.csv` 名册能正确解析。上传旧版 `.xls` 应看到「请另存为 .xlsx」提示（预期行为）
- [ ] 作品中心：注册 / 登录 / 学习数据云端同步正常

### 4.3 观测

- [ ] 观察 10 分钟错误日志，无 `FATAL` / 未捕获异常
- [ ] 抽查 `/api/contents` 等接口 200，`Cache-Control` 无异常缓存

---

## 5. 回滚

- [ ] 保留上一个版本号（发布前记录），必要时切回
- [ ] 若因缺密钥启动失败：补齐环境变量后重新部署即可，**不要**通过改代码去掉 fail-fast

---

## 6. 已知遗留（本次不阻塞，但需排期）

| 项 | 风险 | 处理建议 |
|---|---|---|
| `next@14.2.35` | 14.x 仍有可达的 RSC DoS（high）等公告；本部署形态下 Image Optimization / middleware / Server Actions 类漏洞**不可达**（无 `next/image`、无 middleware、无 Server Actions、无 i18n、无 rewrites） | 升级 `next@15.5.28+`，属破坏性大版本，需单独立项回归 |
| `exceljs → uuid`（moderate） | 仅在传入自定义 buffer 时触发，本项目未使用该用法 | 随 exceljs 上游更新 |
| devDependencies 漏洞（vitest / eslint 链） | 不进生产镜像，仅影响开发/CI 环境 | 随工具链升级处理 |
| 真实微信回调 | 已在隔离环境用夹具实测验签/解密/金额/重放逻辑，未做真实商户投递 | 小额真实订单灰度验证 |
