# 教师工作台订阅系统 — 网站后台集成说明

本文说明企业网站（Next.js 14 App Router）如何以「服务端代理」的方式，安全地把教师工作台订阅管理能力接入网站后台。订阅数据本体存放在腾讯云 CloudBase 云函数 `ent`，网站不直连数据库，也不把任何管理凭据下发到浏览器。

---

## 1. 架构图（文字版）

```
浏览器（管理员）
  │
  │  ① 登录后台（既有 admin_session Cookie）
  │  ② 打开 /admin/teacher-sub（本后台新增页面）
  │  ③ 所有请求只打本站 /api/admin/teacher-sub
  ▼
网站服务端（Next.js，企业门户）
  ├─ app/admin/teacher-sub/page.tsx          客户端页面（只含展示与表单，无任何密钥/网关地址）
  ├─ app/api/admin/teacher-sub/route.ts     服务端路由：鉴权 → 校验 → 审计 → 转发
  │     ├─ getAdminFromCookie()             复用既有后台会话
  │     ├─ can(admin, "users.manage")       复用既有 RBAC 权限判定
  │     └─ appendAudit(...)                 复用既有站内审计
  └─ lib/teacher-sub.ts                     服务端专用代理（密钥与网关地址只在这里出现）
        │  fetch + X-Ent-Admin 头 + 8s 超时 + no-store
        ▼
腾讯云 CloudBase 云函数 ent（envId xm-xhy-d6gct2tdec159c251）
  HTTP 访问服务：https://<env>-<appid>.ap-shanghai.app.tcloudbase.com/ent
  └─ /api/admin/users | /grant | /disable | /logs   （由订阅系统实现）
        │
        ▼
  订阅数据 / 账号权限 / 操作日志（云函数自有存储）
```

要点：

- **单向信任**：浏览器永远拿不到 `TWB_ENT_ADMIN_SECRET` 与云函数网关地址；二者只存在于服务端进程的环境中。
- **双重鉴权**：网站侧先校验后台会话与 RBAC，云函数 `ent` 侧再用 `X-Ent-Admin` 共享密钥校验管理请求。
- **两套日志**：网站侧写 `appendAudit`（`teacher_sub.*`），云函数侧另有 `GET /api/admin/logs` 日志，页面同时展示。

---

## 2. 环境变量

在部署平台（Vercel / CloudBase / 自托管）配置，见 `.env.example` 末尾：

| 变量 | 说明 | 是否必填 |
| --- | --- | --- |
| `TWB_ENT_API_BASE` | 云函数 `ent` 的 HTTP 访问服务根地址，**需包含 `/ent` 前缀且不以 `/` 结尾**，例如 `https://<env>-<appid>.ap-shanghai.app.tcloudbase.com/ent` | 是 |
| `TWB_ENT_ADMIN_SECRET` | 管理共享密钥，随每个请求以 `X-Ent-Admin` 头发送，必须与云函数 `ent` 侧配置完全一致 | 是 |

约束与行为：

- 二者**仅服务端使用**，禁止以 `NEXT_PUBLIC_` 前缀暴露，也不要写进任何客户端代码。
- 任一项缺失时，`lib/teacher-sub.ts` 会抛出明确中文错误（如「未配置 TWB_ENT_ADMIN_SECRET……拒绝以空密钥发起管理请求」），**不会静默降级**；页面会进入错误态。
- 不引入任何新 npm 依赖：超时复用既有 `lib/http.ts` 的 `fetchWithTimeout`。
- 示例值一律留空，真实密钥只放在部署平台环境变量中，不进仓库。

---

## 3. API 契约

### 3.1 云函数 `ent` 管理 API（由订阅系统实现，网站只是调用方）

所有请求须带请求头 `X-Ent-Admin: <TWB_ENT_ADMIN_SECRET>`。

| 方法 | 路径（相对 `TWB_ENT_API_BASE`） | 入参 | 返回 |
| --- | --- | --- | --- |
| GET | `/api/admin/users` | `kw=<可选账号关键字>`、`limit=200` | `{ ok:true, users:[Subscriber] }` |
| POST | `/api/admin/grant` | `{ account, days?, until?, note? }` | `{ ok:true, user:Subscriber }` |
| POST | `/api/admin/disable` | `{ account, note? }` | `{ ok:true, user:Subscriber }` |
| GET | `/api/admin/logs` | `limit=100` | `{ ok:true, logs:[AdminLog] }` |

`Subscriber` 字段：

`account`、`registeredAt`、`trialUntil`、`paidUntil`、`grantedUntil`、`validUntil`、`status`、`statusText`、`payState`、`renewState`、`permission`、`autoRenew`、`siteLink:{ status, siteUserId }`、`lastOrderAt`。

六种账号状态（`status` / `SubStatus`）：

| 值 | 含义 | 页面标签色 |
| --- | --- | --- |
| `trial` | 试用中 | 天蓝 |
| `pending` | 待支付 | 琥珀 |
| `paid` | 已付费 | 翠绿 |
| `auto_renew` | 已开通自动续费 | 品牌紫 |
| `expired` | 已到期 | 橙 |
| `disabled` | 权限停用 | 红 |

`AdminLog` 字段：`at`、`actor`、`action`、`target`、`detail`、`ip`。

### 3.2 本站服务端路由 `/api/admin/teacher-sub`

`export const dynamic = "force-dynamic"`，全程 `cache: "no-store"`。

**GET** — 查询列表（可选 `?kw=` 账号关键字）

- 鉴权：`getAdminFromCookie()`，未登录 → `401 {"error":"未登录"}`；`can(admin,"users.manage")` 为假 → `403 {"error":"无权限"}`。
- 返回：`{ ok:true, users:Subscriber[], logs:AdminLog[] }`。`logs` 为最近 100 条，属辅助信息，读取失败时返回空数组而不阻塞列表。
- 上游异常 → `502`，`error` 为中文错误文案。

**POST** — 按 `body.action` 分派

- 公共入参校验（不合法 → `400`）：
  - `account`：正则 `/^[a-zA-Z0-9_\-@.]{2,64}$/`
  - `note`：≤ 200 字（含前后去空白），超长拒绝而非截断
  - `action`：仅 `grant` / `disable`
- `action=grant`：`days` 为 `1..3650` 的整数；`until` 为合法 ISO 日期（`YYYY-MM-DD` 或带时区时间的 ISO 串）。二者可选，调用云函数 `/api/admin/grant`。
- `action=disable`：调用云函数 `/api/admin/disable`。
- 成功后写站内审计 `appendAudit`：

  | action | 审计 `action` | `target` | `detail` |
  | --- | --- | --- | --- |
  | grant | `teacher_sub.grant` | 账号 | 天数 / 到期日 / 备注 |
  | disable | `teacher_sub.disable` | 账号 | 备注 |

  审计 `actor` 取 `getAdminFromCookie().username`，`ip` 取 `clientIp(req)`。
- 返回：`{ ok:true, user:Subscriber }`；上游异常 → `502`。

### 3.3 `lib/teacher-sub.ts` 导出

- 类型：`SubStatus`、`SiteLink`、`Subscriber`、`AdminLog`
- 方法：`listSubscribers(kw?)`、`grantSubscription(account, opts)`、`disableSubscription(account, note?)`、`listAdminLogs(limit?)`

---

## 4. 权限边界（重要）

- **手动开通 / 停用仅能在本后台完成**：`/admin/teacher-sub` 是唯一入口，页面位于 `app/admin` 布局下，继承后台 `robots: noindex`。
- **前端应用不存在该入口**：教师工作台前端（以及网站公开导航、教师自助注册 `/register`）均不提供开通、延长、停用能力；`/register` 仅创建 `teacher` 角色、默认 `["balance.manage"]` 的账号，与订阅权限无关。
- **服务端强制鉴权**：即使有人直接构造请求打 `/api/admin/teacher-sub`，也会先经过后台会话（`401`）与 `users.manage` 权限（`403`）校验；越权请求不会到达云函数。
- **共享密钥不出服务端**：`X-Ent-Admin` 头只在 `lib/teacher-sub.ts` 内注入；客户端组件对 `lib/teacher-sub.ts` 仅做 `import type`（类型会被编译期擦除），运行时不会打包该模块。
- **可访问角色**：当前以 `users.manage` 判定（默认仅超级管理员 `super` 持有）。如需放宽，改 `app/api/admin/teacher-sub/route.ts` 中 `guard()` 的权限名，并同步调整 `app/admin/page.tsx` 头部导航链接的显示条件即可。
- **最小改动原则**：本次仅新增文件，并在 `app/admin/page.tsx` 头部追加一个导航链接、在 `.env.example` 末尾追加两个空值变量；未改动任何既有页面行为与既有 API 语义。

---

## 5. 部署与验证步骤

1. **配置环境变量**：在部署平台设置 `TWB_ENT_API_BASE`、`TWB_ENT_ADMIN_SECRET`（值留空以外的真实值只放平台，不进仓库）。`TWB_ENT_API_BASE` 必须包含 `/ent` 前缀且结尾无 `/`。
2. **确认云函数 `ent` 已就绪**：其 `/api/admin/*` 四个路径可访问，且已配置与网站一致的 `X-Ent-Admin` 共享密钥。
3. **类型检查**：在项目根目录执行 `npx tsc --noEmit`，应无与本次新增文件相关的报错。
4. **构建**：`npm run build`（或项目对应的 `build:cloudbase`）。
5. **登录后台**：以持有 `users.manage` 的账号登录 `/admin`，头部应出现「教师工作台订阅」链接，点击进入 `/admin/teacher-sub`。
6. **功能验证**：
   - 页面正确展示账号、注册/试用/付费/使用期限、六态彩色标签、付费/续费状态、权限状态、自动续费标记、网站账号关联状态与最近操作日志；
   - 搜索框按账号关键字筛选生效；加载中 / 空态 / 错误态均有反馈；
   - 「手动开通」分别用「按天数」与「指定到期日」提交，列表与日志刷新，`appendAudit` 中出现 `teacher_sub.grant`；
   - 「停用」需经过二次确认，提交后状态变为「权限停用」，审计出现 `teacher_sub.disable`；
   - 校验非法入参（非法账号、`days=0/3.5/9999`、非法 `until`、超长备注）应返回 `400`。
7. **越权验证**：未登录直接请求 `/api/admin/teacher-sub` 应返回 `401`；用无 `users.manage` 的账号请求应返回 `403`。
8. **安全核查**：浏览器 DevTools 的 Network / Sources 中不应出现 `TWB_ENT_API_BASE` 的网关地址或 `TWB_ENT_ADMIN_SECRET` 的值；所有网络请求均指向本站 `/api/admin/teacher-sub`。

> 故障排查：页面若显示「未配置 TWB_ENT_API_BASE / TWB_ENT_ADMIN_SECRET…」，说明服务端环境变量缺失；若显示「调用订阅服务超时（8 秒）」或「无法连接订阅服务」，请检查云函数 `ent` 的 HTTP 访问服务、网络连通性与密钥是否一致。

---

## 6. 同域反向代理 `/api/ent/*`

新增 `app/api/ent/[...path]/route.ts`（`dynamic = "force-dynamic"`、`runtime = "nodejs"`）。

### 用途

教师工作台静态页将部署到本站 `public/teacher/`。页面通过**相对路径** `/api/ent/*` 访问云函数 `ent`：

- 浏览器只与 `www.cnxhy.top` 同源通信，**不产生跨域**；
- 云函数网关地址 `TWB_ENT_API_BASE`（形如 `https://xxx.ap-shanghai.app.tcloudbase.com/ent`）只存在于服务端环境变量，**不会暴露给浏览器**；
- 后台管理仍走 `/api/admin/teacher-sub`（带 `X-Ent-Admin` 共享密钥），二者互不干扰。

转发规则：目标 = `TWB_ENT_API_BASE`（已含 `/ent` 前缀，结尾斜杠会被去掉） + `/` + `params.path.join("/")` + 原样查询串。

### 路径示例

| 浏览器请求 | 实际转发到云函数 `ent` |
| --- | --- |
| `/api/ent/api/auth/session` | `${TWB_ENT_API_BASE}/api/auth/session` |
| `/api/ent/api/pay/notify` | `${TWB_ENT_API_BASE}/api/pay/notify` |
| `/api/ent/api/pay/create?plan=pro` | `${TWB_ENT_API_BASE}/api/pay/create?plan=pro`（query 原样透传） |

**微信支付回调地址**可改用同域地址：

```
https://www.cnxhy.top/api/ent/api/pay/notify
```

这样回调报文先经本站代理原样转发到云函数，微信侧无需感知云函数网关域名，也便于统一在 `www.cnxhy.top` 侧做日志与排障。注意回调验签依赖 **raw body 字节一致**，代理用 `await req.text()` 原样转发，绝不做 `JSON.parse`/`stringify`，并透传全部 `Wechatpay-*` 验签头。

### 行为约束

- **方法**：支持 `GET` / `POST` / `PUT` / `OPTIONS`；`OPTIONS` 直接返回 `204` 并带上允许的方法与请求头（不放开 `Access-Control-Allow-Origin`，因为属同源调用）。
- **上游未配置**：`TWB_ENT_API_BASE` 缺失时返回 `503` + 中文 JSON 错误，不静默降级。
- **路径白名单**：`params.path` 每段必须匹配 `/^[A-Za-z0-9_.-]+$/`，并额外拒绝 `.` / `..`；任一不合规则返回 `400`，杜绝 SSRF 与路径穿越。目标根地址固定来自环境变量，浏览器无法改写上游主机。
- **请求头**：仅透传 `authorization`、`content-type`、`accept`、`x-ent-admin`、`x-ent-admin-operator`、`x-twb-internal`、全部 `wechatpay-*`，以及按客户端 IP 填充的 `x-forwarded-for`；**不透传 `host`**（由 fetch 依据目标 URL 自动设置）。
- **超时与失败**：复用 `lib/http.ts` 的 `fetchWithTimeout`，10 秒超时；网络失败或超时返回 `502` + 中文错误。
- **响应**：透传上游 `status` 与 `content-type`，响应体按字节原样返回；`GET` 响应追加 `Cache-Control: no-store`。
- 该代理**不需要** `TWB_ENT_ADMIN_SECRET`：普通业务接口由云函数自行鉴权；管理接口 `X-Ent-Admin` 头由调用方自带并按白名单透传。

### 验证

1. 部署平台配置好 `TWB_ENT_API_BASE`（含 `/ent` 前缀）。
2. 请求 `/api/ent/api/auth/session`，应得到与直连云函数一致的状态码与响应体，且响应头含 `content-type`、GET 含 `Cache-Control: no-store`。
3. 请求 `/api/ent/..%2f..%2fxxx` 或含空格的路径段，应返回 `400`。
4. 临时清空 `TWB_ENT_API_BASE` 后请求，应返回 `503` 且错误信息为中文；恢复后正常。
5. 微信支付回调把商户平台/下单参数里的 notify_url 改为 `https://www.cnxhy.top/api/ent/api/pay/notify`，用真实回调或沙箱验签确认 raw body 与 `Wechatpay-*` 头完整送达。
