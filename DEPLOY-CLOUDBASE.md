# 腾讯云 CloudBase 部署指南（国产化迁移）

本项目原部署在 Vercel（香港节点）。本指南说明如何迁移到**腾讯云 CloudBase（大陆节点）**，
同时把大模型与检索切换为国产服务，使国内服务器可直连、无需代理。

> 前置条件确认：域名 `www.cnxhy.top` **已完成 ICP 备案**（大陆节点强制要求）。

---

## 一、本次代码改了什么

| 文件 | 改动 | 目的 |
|---|---|---|
| `next.config.mjs` | `BUILD_TARGET=cloudbase` 时启用 `output: "standalone"` + 关闭图片优化 | CloudBase 需要独立可运行产物；云函数无 Sharp |
| `scf_bootstrap` | 新增，`PORT=9000` 启动 standalone 服务 | CloudBase HTTP 云函数启动入口（**必须 LF 换行**） |
| `scripts/postbuild-cloudbase.mjs` | 新增 | 把 `.next/static`、`public` 补进 standalone 产物，否则前端资源 404 |
| `lib/llm.ts` | 新增 | 国产大模型统一层（DeepSeek/通义/豆包/智谱/Kimi/MiniMax），OpenAI 兼容协议 |
| `app/api/chat/route.ts` | 改用 `llmChat()` | AI 客服接入国产模型 |
| `app/api/hub/generate/route.ts` | 改用 `llmChat()` | 知识中枢接入国产模型 |
| `lib/search.ts` | 新增博查 `bocha` 源并置为首选 | 国内可直连的中文检索 |
| `package.json` | 新增 `build:cloudbase` | 一键产出 CloudBase 产物 |

**未改动**：业务页面、排课引擎、支付流程、后台管理。Vercel 部署不受影响——
standalone 仅在显式设置 `BUILD_TARGET=cloudbase` 时启用。

---

## 二、选 HTTP 云函数还是云托管

| | HTTP 云函数 | 云托管 CloudRun |
|---|---|---|
| 成本 | 低（按调用计费，有免费额度） | 较高（常驻实例） |
| 冷启动 | 约 1–3 秒 | 无 |
| 长任务 | 需配置超时（建议 60s） | 无硬超时 |
| 部署方式 | `scf_bootstrap` | `Dockerfile` |
| 适合 | 访问量不大、成本敏感 | 追求稳定低延迟 |

**建议先用 HTTP 云函数**（成本低、官方教程成熟）。若上线后觉得冷启动明显，
改用云托管——本仓库已附 `Dockerfile`，直接切换即可。

---

## 三、部署步骤（HTTP 云函数）

### 1. 创建 CloudBase 环境
控制台 → 云开发 CloudBase → 新建环境。
**地域选大陆**（如上海/广州）。数据库类型选 **PostgreSQL 版**（官方称 100% 兼容 Supabase）。

### 2. 配置构建命令
在 CloudBase 应用/函数的构建配置里填：

- 安装命令：`npm install`
- 构建命令：`npm run build:cloudbase`
  （等价于 `BUILD_TARGET=cloudbase next build && node scripts/postbuild-cloudbase.mjs`）
- Node 版本：**18 或 20**（Next.js 14 要求 ≥ 18.17）
- 函数超时：**60 秒**
- 内存：建议 512MB 以上

> ⚠️ 不要用 `npm run build` 直接部署 CloudBase 版本——那样是标准产物，云函数起不来。

### 3. 配置环境变量
见下方第五节。

### 4. 部署并绑定域名
部署完成后，在控制台绑定自定义域名 `www.cnxhy.top`，按提示完成 DNS 解析（CNAME）。
CloudBase 会自动签发 HTTPS 证书。

---

## 四、部署步骤（云托管，可选）

若选云托管，使用仓库根目录的 `Dockerfile`：

```bash
docker build -t xm-tech-portal .
docker run -p 9000:9000 --env-file .env.production xm-tech-portal
```

构建时同样需要 `BUILD_TARGET=cloudbase`（`Dockerfile` 内已设置）。

---

## 五、环境变量清单

### A. 存储（必填）

| 变量 | 说明 |
|---|---|
| `SUPABASE_URL` | CloudBase PG 提供的 Supabase 兼容 API 地址 |
| `SUPABASE_SERVICE_ROLE_KEY` | 服务端密钥（**不要**用 anon key，会受 RLS 限制） |

> CloudBase PG / 阿里云 AnalyticDB Supabase 版 / 火山 AIDAP 都与 Supabase API 兼容，
> 填好这两个变量后**业务代码无需改动**。

### B. 国产大模型（选配一个；不配则 AI 客服走规则引擎+知识库兜底）

| 变量 | 说明 |
|---|---|
| `LLM_PROVIDER` | `deepseek`（推荐）/ `qwen` / `doubao` / `zhipu` / `kimi` / `minimax` / `openai` |
| `DEEPSEEK_API_KEY` | DeepSeek 密钥（推荐，性价比最高） |
| `DASHSCOPE_API_KEY` | 通义千问密钥 |
| `ARK_API_KEY` | 豆包（火山方舟）密钥 |
| `ZHIPU_API_KEY` | 智谱 GLM 密钥 |
| `MOONSHOT_API_KEY` | Kimi 密钥 |
| `LLM_MODEL` | 可选，覆盖默认型号（厂商型号变更时用这个兜底，无需改代码） |

自定义端点时用：`LLM_BASE_URL` + `LLM_API_KEY`。

### C. 国产检索（选配）

| 变量 | 说明 |
|---|---|
| `BOCHA_API_KEY` | 博查搜索密钥，申请：https://open.bochaai.com |
| `BOCHA_ENDPOINT` | 可选，覆盖端点（默认 `https://api.bochaai.com/v1/web-search`） |
| `BOCHA_FRESHNESS` | 可选，`noLimit`/`day`/`week`/`month`/`year`，默认 `noLimit` |

> 未配置任何检索源时，检索页会展示示例数据并提示原因，不会报错。

### D. 微信支付（如已配置则沿用）

`PAY_PROVIDER=wechat`、`WECHAT_PAY_MCH_ID`、`WECHAT_PAY_APP_ID`、
`WECHAT_PAY_API_V3_KEY`、`WECHAT_PAY_SERIAL`、`WECHAT_PAY_PRIVATE_KEY`、
`WECHAT_PAY_CERT`

**`PAY_NOTIFY_BASE` 务必改成 CloudBase 域名**（如 `https://www.cnxhy.top`），
并在微信商户平台把回调地址配置为：
`https://www.cnxhy.top/api/pay/callback/wechat`

### E. 其他

| 变量 | 说明 |
|---|---|
| `ADMIN_SESSION_SECRET` | 后台会话密钥，建议设为新的随机值 |
| `BUILD_TARGET` | 构建期设为 `cloudbase` |

配置完环境变量后**必须重新部署**才会生效。

---

## 六、数据迁移（Supabase 官方云 → CloudBase PG）

1. 在 CloudBase PG 中执行 `supabase/schema.sql` 建表（复用现有零 DDL 结构）。
2. 执行 `supabase/grant-service-role.sql` 授权（否则会报 42501 权限错误）。
3. 导出旧库数据。若 Supabase 允许直连：
   ```bash
   pg_dump --data-only --table=contents "<旧库连接串>" > contents_data.sql
   psql "<新库连接串>" < contents_data.sql
   ```
   不方便直连时，在 Supabase 控制台导出 `contents` 表为 CSV，再导入新库。
4. 迁移后**先在 CloudBase 环境验证后台读写**，确认无误再切域名解析。

> 迁移期间 Vercel 站点保持运行即可，两套环境互不干扰，切换只是改 DNS。

---

## 七、已知差异与注意事项

1. **必须配置数据库**。CloudBase 云函数的文件系统是只读的，
   项目自带的 JSON 文件存储（`data/db.json`）在云函数上不可用。
   配好 `SUPABASE_URL` + 密钥即可，代码会自动切到 Supabase 实现。
2. **冷启动**：HTTP 云函数首次访问约 1–3 秒，之后复用实例。云托管无此问题。
3. **函数超时**：`/api/search` 需要约 30 秒，务必把超时设为 **60 秒**，否则检索会中断。
4. **图片优化**：CloudBase 无 Sharp，已关闭。本项目未使用 `next/image`，无实际影响。
5. **`scf_bootstrap` 换行符**：必须是 LF。Windows 下若用记事本编辑会变成 CRLF，
   导致启动报 `^M: bad interpreter`。仓库中该文件已是 LF，请勿改动。
6. **海外服务**：`api.openai.com`、Tavily、Brave 在国内直连不通。
   已改用国产模型 + 博查。若仍保留 `OPENAI_API_KEY`，自动探测会把它排在最后，
   仅当没有任何国产密钥时才使用（届时会因网络不通而故障转移到规则引擎）。
7. **微信支付证书**：走环境变量传入 PEM（支持单行 `\n` 或多行），云函数常驻进程下无持久化问题。

---

## 八、回滚方案

CloudBase 出问题时，把域名 DNS 解析改回 Vercel 的 CNAME 即可，
几分钟内恢复。Vercel 侧代码保持同步（同一份代码两种构建目标），无需维护两套代码。

---

## 九、部署后自检清单

- [ ] 首页 `/` 打开正常，样式与脚本无 404（说明 standalone 产物完整）
- [ ] 排课页 `/schedule` 可用，导出触发支付二维码
- [ ] 后台 `/admin` 可登录，读写的改动能持久化（验证数据库）
- [ ] 「产品付费」→ 运行支付自检，确认 `provider: wechat` 且无缺失项
- [ ] AI 客服提问，观察是否由国产模型应答（响应 `engine: "llm"`）
- [ ] 检索页查询，确认 `provider: "bocha"` 而非 `mock`
