# 腾讯云 CloudBase 部署指南（国产化迁移）

本项目原部署在 Vercel（香港节点）。本指南说明如何迁移到**腾讯云 CloudBase（大陆节点）**。

> 前置条件：域名 `www.cnxhy.top` **已完成 ICP 备案**（大陆节点强制要求）。
> 代码已就绪（含 `Dockerfile`），GitHub 仓库 `XM-XHY/portal`（`master` 分支）已是最新。

---

## 零、方案选择：推荐「云托管 + GitHub」

CloudBase 提供两种承载 Next.js 的方式，**推荐云托管（CloudRun）**：

| | 云托管 CloudRun（推荐） | HTTP 云函数 |
|---|---|---|
| 部署方式 | **关联 GitHub，自动构建** | 本地构建后上传 zip |
| 后续更新 | **git push 即自动部署**（同 Vercel 体验） | 每次手动打包上传 |
| 冷启动 | 最小实例≥1 时无冷启动 | 约 1–3 秒 |
| 构建环境 | 云端 Linux（无 Windows 平台差异） | 依赖本地构建 |
| 成本 | 常驻实例，较高 | 按调用计费，较低 |

**选云托管的决定性理由**：仓库里已有 `Dockerfile`，且项目**没有任何 `NEXT_PUBLIC_*` 变量**
（全部配置都是服务端运行时读取），因此云端构建无需预置任何环境变量，控制台改配置也不用重新构建。

若你更在意成本，可改用 HTTP 云函数，见文末「备选方案」。

---

## 一、开通 CloudBase 环境

1. 打开 **CloudBase 控制台**：https://console.cloud.tencent.com/tcb
2. 新建环境：
   - **计费方式选「按量付费」**（包月套餐不支持云托管）
   - **地域选大陆**（如上海 `ap-shanghai`、广州 `ap-guangzhou`）
   - **数据库类型选 PostgreSQL 版**（官方称 100% 兼容 Supabase，可平滑迁移）
3. 记下**环境 ID**（形如 `xxx-1a2b3c4d`），后面要用。

> 新用户通常有免费额度/个人版，可先把流程跑通。

---

## 二、准备数据库并获取连接信息

在环境内找到 **PostgreSQL / 数据库** 页面，取得：

| 需要的值 | 填入项目的环境变量 |
|---|---|
| Supabase 兼容 API 地址 | `SUPABASE_URL` |
| service_role 密钥 | `SUPABASE_SERVICE_ROLE_KEY` |

**建表**：在数据库控制台的 SQL 执行窗口，依次执行仓库里的两个脚本：

1. `supabase/schema.sql` —— 建表 + 种子数据
2. `supabase/grant-service-role.sql` —— **必须执行**，否则所有请求报 `42501` 权限错误

**迁数据**（可选，先把站点跑通也可稍后做）：
从旧 Supabase 导出 `contents` 表（CSV 或 `pg_dump --data-only`），导入新库。

> 若暂时拿不到 CloudBase PG 的 Supabase 兼容地址，可先填现有 Supabase 的
> `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` 把站点跑通，再择机迁移。
> 但注意：国内服务器访问海外 Supabase 可能不稳定，长期建议迁移到国内库。

---

## 三、云托管部署（控制台操作）

1. 进入刚建的环境 → 左侧 **云托管** → **新建服务**
2. 服务配置：
   - **服务名称**：`xm-tech-portal`
   - **镜像来源**：选「**代码仓库**」
   - **代码平台**：GitHub → 首次需**授权**腾讯云访问你的 GitHub
   - **仓库**：`XM-XHY/portal`
   - **分支**：`master`
   - **Dockerfile 路径**：`./Dockerfile`（在根目录，也可留空）
   - **端口**：`9000`
   - **访问类型**：`WEB`（公网访问）
3. 资源配置：
   - CPU `0.5` 核 / 内存 `1 GB`（内存须为 CPU 的 2 倍）
   - **最小实例数**：生产建议 `1`（避免冷启动）；想省钱可设 `0`（连续 30 分钟无流量才缩容）
   - 最大实例数：`5`
4. **开启「自动部署」**（关键）：
   系统会在 GitHub 配置 Webhook，此后 `git push` 到 `master` 即自动构建发布。
5. 点「**部署**」，等待构建完成（首次约 3–8 分钟，需拉取依赖并构建镜像）。

部署完成后会得到一个默认域名 `https://xxx.app.tcloudbase.com`，先用它验证。

---

## 四、配置环境变量

路径：云托管 → 服务 → **服务配置 / 环境变量**（或「更新服务」页面）。

> ⚠️ 官方已知坑：**通过 API/MCP 更新环境变量会整体覆盖**。
> 在控制台界面逐条添加则安全；添加完建议复查一遍没有丢项。

### 必填

| 变量 | 值 |
|---|---|
| `SUPABASE_URL` | 第二步拿到的 API 地址 |
| `SUPABASE_SERVICE_ROLE_KEY` | 服务端密钥（**不要用 anon key**，会被 RLS 拦截） |
| `ADMIN_SESSION_SECRET` | 后台会话密钥，建议生成新的随机长字符串 |
| `INITIAL_ADMIN_PASSWORD` | **新部署必填**：首次播种的初始管理员口令（源码不再含明文口令）。已有账号的线上库不受影响，但历史口令请在「后台 → 账号安全」手动轮换 |
| `PAY_GRANT_SECRET` | 建议配置：付费下载授权票据签名密钥，缺省回落到 `ADMIN_SESSION_SECRET` |

> 账号说明：`admins` 表为空时才会播种 `admin`(超管) / `market`(线索) 两个账号。
> 未配置 `INITIAL_ADMIN_PASSWORD` 会随机生成口令并**只打印一次到启动日志**，需从日志捞取。

### 公众号（选配）

| 变量 | 说明 |
|---|---|
| `WECHAT_MP_TOKEN` / `WECHAT_MP_APPID` | 服务器配置 Token 与 AppID，二者齐全接口才启用 |
| `WECHAT_MP_APPSECRET` | 设置自定义菜单时用 |
| `WECHAT_MP_AESKEY` | 43 位 EncodingAESKey，**服务器配置选「安全模式」时必填**；明文/兼容模式可不填 |
| `WECHAT_MP_DEFAULT_CODE` | 可选默认查询码，家长只发姓名也能查 |

公众号消息接口现支持明文/兼容/安全三种模式，菜单 CLICK 事件（HELP / QUERY / UNBIND）与「解绑」文本指令均已实现。

### 国产大模型（选配，不配则 AI 客服走规则引擎+知识库兜底）

| 变量 | 说明 |
|---|---|
| `LLM_PROVIDER` | `deepseek`（推荐） |
| `DEEPSEEK_API_KEY` | DeepSeek 密钥，https://platform.deepseek.com |

其他可选厂商：`qwen`（`DASHSCOPE_API_KEY`）、`doubao`（`ARK_API_KEY`）、
`zhipu`（`ZHIPU_API_KEY`）、`kimi`（`MOONSHOT_API_KEY`）、`minimax`（`MINIMAX_API_KEY`）。
厂商型号变更时用 `LLM_MODEL` 覆盖即可，无需改代码。

### 国产检索（选配）

| 变量 | 说明 |
|---|---|
| `BOCHA_API_KEY` | 博查搜索密钥，https://open.bochaai.com |

未配置任何检索源时，检索页展示示例数据并说明原因，不会报错。

### 微信支付（如已配置则沿用）

必填：`PAY_PROVIDER=wechat`、`WECHAT_PAY_MCH_ID`、`WECHAT_PAY_APP_ID`、
`WECHAT_PAY_API_V3_KEY`、`WECHAT_PAY_SERIAL`、`WECHAT_PAY_PRIVATE_KEY`

验签凭据**二选一**（推荐前者）：

| 方案 | 变量 | 获取方式 | 说明 |
|---|---|---|---|
| **微信支付公钥（推荐）** | `WECHAT_PAY_PUBKEY_ID` + `WECHAT_PAY_PUBKEY` | 商户平台 → API 安全 → 微信支付公钥，页面直接查看复制 | 免证书下载工具，无证书轮换问题 |
| 平台证书（传统） | `WECHAT_PAY_CERT` | 需用微信官方「证书下载工具」拉取 `wechatpay_*.pem` | 平台证书会轮换，需定期更新 |

两者同时配置时，代码自动**优先采用公钥模式**。后台「支付通道状态」会显示当前生效的验签模式。

**`PAY_NOTIFY_BASE` 改为 `https://www.cnxhy.top`**，并在微信商户平台配置回调地址：
`https://www.cnxhy.top/api/pay/callback/wechat`

改完环境变量后需**重启/重新部署服务**才生效。

---

## 五、绑定自定义域名

1. 云托管 → 你的服务 → **自定义域名** → 添加域名
2. 填 `www.cnxhy.top`，平台会返回一段 **CNAME 值**
3. 去你的域名 DNS 服务商，添加 CNAME 记录指向该值
4. 证书：选「**自动申请免费证书**」（ACME 代签）
5. 等状态变为「已生效」（几分钟到一两小时）

**切换流量**：确认新站一切正常后，再把 DNS 切到 CloudBase。
切换前 Vercel 站点照常运行，两套环境并存，回滚只需改回 DNS。

---

## 六、验证清单

```bash
# 1. 首页
curl -I https://www.cnxhy.top/          # 预期 200
# 2. SSR 内容（确认服务端渲染与数据读取正常）
curl https://www.cnxhy.top/ | grep -o "智能排课系统"
```

浏览器逐项确认：

- [ ] 首页样式与脚本正常（**若 CSS/JS 404，说明 `.next/static` 没进镜像，检查 Dockerfile**）
- [ ] `/schedule` 排课可用，导出触发支付二维码
- [ ] `/admin` 可登录，**改一项内容后刷新仍在**（验证数据库读写）
- [ ] 后台「产品付费」→ **运行支付自检**，确认 `provider: wechat` 且无缺失项
- [ ] AI 客服提问，响应 `engine: "llm"`（说明国产模型生效）
- [ ] 检索页查询，确认 `provider: "bocha"` 而非 `mock`

---

## 七、常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| 部署成功但 503 | 容器端口未正确暴露 | 确认 Dockerfile `EXPOSE 9000` 且服务端口填 9000 |
| CSS / `_next/static/*.js` 全 404 | `.next/static` 未 COPY 进运行镜像 | Dockerfile 中 `standalone` 已由 postbuild 补齐，检查构建日志 |
| 后台保存后读不到 | 未配数据库或用了 anon key | 必填 `SUPABASE_SERVICE_ROLE_KEY`；并执行 `grant-service-role.sql` |
| 报 `42501` 权限错误 | 新库未执行授权脚本 | 执行 `supabase/grant-service-role.sql` |
| 启动报 `^M: bad interpreter` | `scf_bootstrap` 变成 CRLF | 仅 HTTP 云函数方案会遇到；已用 `.gitattributes` 锁 `eol=lf` |
| 改了环境变量前端仍是旧值 | `NEXT_PUBLIC_*` 需构建期注入 | 本项目无此变量，不会出现；若出现请重新部署 |

---

## 八、备选方案：HTTP 云函数（更省成本）

不用 Dockerfile，改走 HTTP 云函数：

1. 本地构建产物：
   ```bash
   npm run build:cloudbase
   ```
2. 把 `.next/standalone` 目录内容 + 仓库根目录的 `scf_bootstrap` 一起打包为 zip
   （`scf_bootstrap` 必须在 zip 根目录）
3. 控制台 → 云函数 → 新建 → 选「**HTTP 云函数**」
   - 运行环境：Node.js 20.19 或 18.15
   - 提交方法：本地上传 zip / 文件夹
   - 内存：512 MB 以上
   - 函数超时：**60 秒**（`/api/search` 需要约 30 秒）
4. 环境变量在「函数配置 → 环境变量」中填（同上第四节）
5. 控制台 → **HTTP 访问服务** → 添加自定义域名 → 关联该云函数，触发路径填 `/`

> 注意：云函数文件系统只读，**必须配数据库**，本地 JSON 存储不可用。

---

## 九、回滚

CloudBase 出问题时，把域名 DNS 解析改回 Vercel 的 CNAME，几分钟内恢复。
两边共用同一份代码（不同构建目标），无需维护两套代码。
