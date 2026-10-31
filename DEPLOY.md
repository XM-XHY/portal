# 部署到 Vercel（含 Supabase 联动）

本项目已按 Serverless 生产环境适配完成，构建通过（`npm run build` exit 0）。
按下面步骤操作即可上线，**代码无需任何改动**。

---

## 零、当前已上线的部署（2026-10-31）

| 项 | 值 |
|---|---|
| 线上地址 | **https://xm-tech-portal.vercel.app** |
| Vercel 控制台 | https://vercel.com/xhy6/xm-tech-portal |
| 团队 / 项目 | `xhy6` / `xm-tech-portal`（`prj_LQQvY8YKmkX9ufaVMIlXXc5rJ3za`） |
| 部署状态 | READY（构建 exit 0，全部路由 ƒ 动态渲染） |
| 已配置环境变量 | `ADMIN_SESSION_SECRET`（随机 32 字节，已加密存储）、`SEARCH_MKT=zh-CN` |
| 部署保护 | 已关闭（ssoProtection=null），访客可直接访问 |
| 当前数据层 | **JSON 文件（未接数据库）** → 后台修改**不会持久化** |

### ⚠️ 上线后必须补的一步：接 Supabase 才能持久保存

Vercel 文件系统只读，当前后台的修改只在**单个实例的内存中**生效，刷新或换实例即回到默认值。
只要把下面三个环境变量补进 Vercel（**Settings → Environment Variables**），再 Redeploy 一次即可持久，**代码零改动**：

1. 先在 Supabase **SQL Editor** 执行 `supabase/schema.sql`
2. 在 Vercel 填入：`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`（`SUPABASE_ANON_KEY` 可选）
3. Redeploy

> 可选增强：`BING_API_KEY`（真实全网检索）、`LLM_API_KEY`（AI 摘要+引用来源）。

### 部署踩坑记录（供复用）

- `.vercelignore` 中若写 `data`（无前导斜杠），会匹配**任意层级**的 `data` 目录，
  把源码 `lib/data/` 一并排除，导致构建报 `Module not found: Can't resolve './data/types'`。
  必须写成 `/data`。
- 新建的 Vercel 团队默认开启 **Vercel Authentication**（`ssoProtection`），
  会让访客被登录墙拦截；需通过 API 将其置为 `null` 关闭。

---

## 一、准备 Supabase（数据层）

> 若不配置 Supabase，站点会退化为 JSON 文件存储；而 Vercel 文件系统只读，
> 数据将无法持久化（页面不会报错，但后台修改重启即丢失）。因此**线上必须配 Supabase**。

1. 打开 https://supabase.com 创建项目（免费额度足够）。
2. 进入 **SQL Editor**，把 `supabase/schema.sql` 的内容**整段粘贴执行**。
   - 会创建 6 张表：site_info / admins / leads / contents / search_logs / audit_logs
   - 并写入初始数据（企业信息、管理员、4 个产品、3 个案例、3 条资讯）
3. 进入 **Project Settings → API**，复制三项：
   - `Project URL` → `SUPABASE_URL`
   - `service_role` key（**服务端专用，切勿暴露到浏览器**）→ `SUPABASE_SERVICE_ROLE_KEY`
   - `anon` key（可选）→ `SUPABASE_ANON_KEY`

应用启动时检测到 `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`，会自动切换到 Supabase 存储。

---

## 二、部署到 Vercel

### 方式 A：Git 导入（推荐，后续推送即自动部署）

1. 把代码推到 GitHub / GitLab / Bitbucket（若还没推）：
   ```bash
   git remote add origin <你的仓库地址>
   git push -u origin main
   ```
2. 打开 https://vercel.com/new → Import 该仓库 → Framework 自动识别为 **Next.js**
3. 在 **Environment Variables** 中填入下方"环境变量清单"
4. 点 **Deploy**

### 方式 B：Vercel CLI

```bash
npm i -g vercel
vercel login            # 浏览器授权
vercel link             # 关联项目（首次）
vercel env add ADMIN_SESSION_SECRET production   # 逐个添加环境变量（也可用网页面板批量添加）
npm run deploy          # 等价于 vercel --prod
```

---

## 三、环境变量清单（在 Vercel 面板 → Settings → Environment Variables 添加）

| 变量名 | 必需 | 说明 |
|---|---|---|
| `SUPABASE_URL` | ✅ | Supabase 项目 URL，不填则用 JSON 文件存储（Vercel 上不持久化） |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service_role 密钥，仅服务端使用 |
| `SUPABASE_ANON_KEY` | 可选 | 前端匿名密钥，当前架构未使用 |
| `ADMIN_SESSION_SECRET` | ✅ | **后台会话签名密钥，务必设为随机强值**（否则日志会告警、会话可被伪造）。生成：`openssl rand -hex 32` |
| `BING_API_KEY` | 可选 | 启用真实全网检索（Azure Bing Search v7）。不填则搜索返回内置示例 |
| `SERPAPI_KEY` | 可选 | Bing 的备用检索源 |
| `LLM_API_KEY` | 可选 | 启用 AI 摘要（带引用来源）。OpenAI 兼容接口 |
| `LLM_BASE_URL` | 可选 | 默认 `https://api.openai.com/v1`，可换 DeepSeek/通义/自建网关 |
| `LLM_MODEL` | 可选 | 默认 `gpt-4o-mini` |
| `SEARCH_MKT` | 可选 | 检索市场，默认 `zh-CN` |
| `DATA_DIR` | 可选 | JSON 存储目录；Vercel 上可设 `/tmp`（仍不持久，仅供临时验证） |

> 修改环境变量后需 **Redeploy** 才会生效。

---

## 四、部署后验证清单

1. 首页 `/` 打开正常，导航栏显示你的企业名称
2. `/products`、`/cases`、`/about` 三个页面内容齐全
3. `/explore` 输入关键词：配了 `BING_API_KEY` 则返回真实结果 +（配了 LLM）AI 摘要；
   未配则返回示例结果（页面仍可用）
4. `/admin` 用 `admin / admin123` 登录 → **站点设置**改公司名称 → 回首页刷新，名称已更新
   （说明 Supabase 读写正常 + 动态渲染生效）
5. 后台提交一条测试线索 → Supabase 控制台 `leads` 表能看到该记录
6. **立即修改默认密码**：后台「账号安全」页修改，或在上线前改 `supabase/schema.sql` 的种子哈希

---

## 五、本项目为部署已做的适配（无需你再处理）

- `vercel.json`：框架识别、构建命令、香港区域(hkg1)、搜索接口超时放宽到 30s、API 不缓存
- `app/layout.tsx`：`export const dynamic = "force-dynamic"`
  —— **关键**：保证后台修改企业信息/内容后前端立即生效，
  否则 Vercel 会把页面预渲染成静态产物，后台改动要重新构建才看得到
- `lib/data/json-repo.ts`：Serverless 只读文件系统下写入失败时降级为内存缓存并告警，页面不 500
- `lib/session.ts`：生产环境未设 `ADMIN_SESSION_SECRET` 时打印安全告警
- 所有路由均为动态渲染（构建输出可见 `ƒ` 标记）

---

## 六、常见问题

| 现象 | 原因 / 处理 |
|---|---|
| 后台改了企业信息，线上首页不变 | 确认 `ADMIN_SESSION_SECRET` 无关；检查是否 `force-dynamic` 被移除，或浏览器缓存（强刷 Ctrl+F5） |
| 搜索一直返回示例数据 | 未配置 `BING_API_KEY`（或配额耗尽），属预期兜底行为 |
| 登录提示 401 | 默认账号 `admin/admin123`、`market/market123`；确认 Supabase `admins` 表已 seed |
| 页面 500 | Vercel 日志查看；多为 Supabase 密钥错误或表未建（需执行 schema.sql） |
| 线索提交后后台看不到 | 确认 `SUPABASE_SERVICE_ROLE_KEY` 正确，且 `leads` 表存在 |
