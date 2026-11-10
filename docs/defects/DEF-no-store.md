# DEF-no-store · 路由 no-store 缺口只读审计

> 类型：**只读审计**（不修改任何路由源文件）。
> 归属：流程·度量·代码审查域（何序）。
> 依据：全面测试最终报告 §6 / §7.9 提到「no-store 20/51」；本报告用 Grep 重新统计当前代码实况并纠正口径。

## 1. 统计方法（可复算）

```bash
# 路由文件总数
find app -name "route.ts" | wc -l
# 含 no-store 的路由
grep -rl "no-store" app --include="route.ts" | wc -l
# 缺 no-store 的路由（列出）
grep -rL "no-store" app --include="route.ts"
# 是否通过共享 middleware / 工具统一注入（结果：无）
find . -path ./node_modules -prune -o -name "middleware.ts" -print
grep -rln "Cache-Control" --include="*.ts" lib components app | grep -v "app/api"
```

- 无 `middleware.ts`，无 `lib/` / `components/` 中的共享 `Cache-Control` 工具 —— 因此**每个路由单独决定**是否带 `no-store`，不存在“一处配全局生效”的误判。

## 2. 统计结果

| 指标 | 数值 |
|---|---|
| API 路由文件总数 | **51** |
| 已设置 `no-store` 的路由 | **20** |
| 含 `Cache-Control` 但未用 `no-store` 的路由 | **0**（20 个 Cache-Control 均为 no-store） |
| **缺 `no-store` 的路由（缺口）** | **31** |

## 3. 与报告中「20/51 缺 no-store」的口径纠正

- 报告 §6 / §7.9 写作「no-store 20/51（缺）」，但按代码实测：**20/51 是「已设置」no-store 的数量，31/51 才是「缺」no-store 的数量**。
- 即报告原表述疑似把「已设置」误写成「缺」。本审计以 Grep 实测为准：**缺口 = 31**，而非 20。
- 无论采用哪种口径，**这都是一个高优先级的专项**，不应被「20」的小数字低估。

## 4. 缺 no-store 的 31 条路由清单（按敏感度分级）

### 4.1 高敏感（会话 / 鉴权 / 支付 / 后台 / 用户数据）—— 必须优先补
- `app/api/auth/login/route.ts`
- `app/api/auth/logout/route.ts`
- `app/api/auth/me/route.ts`
- `app/api/auth/register/route.ts`
- `app/api/auth/change-password/route.ts`
- `app/api/balance/manage/route.ts`
- `app/api/balance/publish/route.ts`
- `app/api/balance/query/route.ts`
- `app/api/pay/order/route.ts`
- `app/api/pay/status/route.ts`
- `app/api/pay/self-report/route.ts`
- `app/api/pay/selfcheck/route.ts`
- `app/api/pay/payconfig/route.ts`
- `app/api/pay/mock-notify/route.ts`
- `app/api/pay/callback/alipay/route.ts`
- `app/api/pay/callback/wechat/route.ts`
- `app/api/pay/refund/wechat/route.ts`
- `app/api/admin/orders/route.ts`
- `app/api/admin/orders/refund/route.ts`
- `app/api/audit/route.ts`
- `app/api/leads/route.ts`
- `app/api/leads/export/route.ts`

### 4.2 中敏感（含业务数据 / 可写 / 查询日志）
- `app/api/products/reorder/route.ts`
- `app/api/schedule/generate/route.ts`
- `app/api/schedule/import/route.ts`
- `app/api/schedule/export/route.ts`
- `app/api/schedule/template/route.ts`
- `app/api/search-logs/route.ts`

### 4.3 低敏感（公开只读内容 / 站点元信息）
- `app/api/contents/route.ts`
- `app/api/site/route.ts`
- `app/api/products/route.ts`（列表只读）
- `app/api/wechat/mp/route.ts`

> 说明：低敏感路由虽为公开只读，但若响应含按用户态变化的片段（如个性化内容），仍建议 `no-store` 以防共享代理缓存泄漏；优先级低于 4.1/4.2。

## 5. 风险

- 高敏感路由（登录态、支付态、后台）缺 `no-store`，在共享 / 反向代理 / CDN 层可能被缓存，导致**会话与用户数据跨用户泄漏**、支付态被复用，属安全红线外溢（与 DEF-014~DEF-018 同源风险面）。

## 6. 处置建议（专项，不批量改 51 路由）

1. **不一次性批量改 51 个路由**（风险高、易引入回归、且部分公开只读路由需评估是否需要 no-store）。
2. 先做**专项 PR**：为 4.1 高敏感 22 条路由补 `Cache-Control: no-store`（建议在统一响应工具 / 中间件中注入，而非逐文件散改；但当前无共享工具，故专项内集中处理并补充单元测试）。
3. 4.2 中敏感 6 条随第二轮补齐；4.3 低敏感按内容个性化程度评估。
4. 在 CI 中加一条静态断言：扫描 `app/api/**/route.ts`，凡是 `auth` / `pay` / `admin` / `balance` 目录下的路由必须含 `no-store`，否则 lint/CI 失败（fail-close 检查）。
5. 关闭条件：高敏感 22 条 100% 覆盖 + 静态断言生效。

## 7. 结论

- 实测缺口 **31/51** 路由缺 `no-store`（报告「20/51 缺」口径有误，实为 20/51 已设置）。
- 本文件为**只读审计产物**，未修改任何源文件；整改留专项处理。
- 关联：SECURITY.md「无响应式缓存」要求；RELEASE-GATE.md 安全红线。
