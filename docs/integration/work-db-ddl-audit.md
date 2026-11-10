# 作品中心 work_* 表 DDL 审计（DEF-004 关闭依据）

- **审计对象**：`cloudbase/migrations/20261105182001_portal_pg_migration_prep.sql` ↔ `lib/work-db.ts`
- **审计方式**：只读静态比对（DDL 列定义 vs 代码写入/查询字段），未连接数据库执行
- **审计时间**：2026-11-05
- **结论**：**4 张表 DDL 齐全，字段与代码一一对应，索引与权限已就位 → DEF-004 可关闭**

---

## 1. 表存在性

| 表 | DDL | 用途 |
|---|---|---|
| `work_users` | ✅ 存在 | 作品中心 C 端会员账号（PBKDF2 加盐口令） |
| `work_entitlements` | ✅ 存在 | 会员权益（按 order_id 唯一，保证回调幂等发权益） |
| `work_mistakes` | ✅ 存在 | 错题本 |
| `work_flywheel` | ✅ 存在 | 学习飞轮记录 |

原缺陷描述的「国产库回滚路径缺 work_* DDL」已不成立：迁移脚本中四表齐全，
`GRANT ... TO service_role` 与 `REVOKE SELECT ... FROM anon` 也已包含。

## 2. 字段一致性对照

### work_users
| DDL 列 | 类型 | 代码写入 | 一致 |
|---|---|---|---|
| id | text PK | `newId("wu_")` | ✅ |
| account | text NOT NULL UNIQUE | `account` | ✅ |
| pw_hash | text NOT NULL | `hashPassword(pw)` | ✅ |
| created_at | timestamptz NOT NULL | `nowIso` | ✅ |
| trial_until | timestamptz NOT NULL | 注册时 +试用天数 | ✅ |
| status | text NOT NULL DEFAULT 'active' | `"active"` | ✅ |
| last_login_at | timestamptz | 登录时刷新 | ✅ |

### work_entitlements
| DDL 列 | 类型 | 代码写入 | 一致 |
|---|---|---|---|
| id | text PK | `newId("we_")` | ✅ |
| user_id | text NOT NULL FK→work_users | `userId` | ✅ |
| plan | text NOT NULL | `plan` | ✅ |
| days | integer NOT NULL | `days`（≥1） | ✅ |
| order_id | text NOT NULL **UNIQUE** | `orderId` | ✅ 唯一约束即幂等保证 |
| paid_until | timestamptz NOT NULL | 累加计算 | ✅ |
| created_at | timestamptz NOT NULL | ISO 时间 | ✅ |

索引：`work_entitlements_user_idx (user_id, paid_until DESC)` — 与 `getEntitlement` 按 user 取最新权益的查询模式匹配 ✅

### work_mistakes
| DDL 列 | 类型 | 代码写入 | 一致 |
|---|---|---|---|
| id | text PK（无默认值） | `` `${userId}::${sub}::${id}` `` | ✅ 代码自带，满足非空主键 |
| user_id | text NOT NULL FK | `userId` | ✅ |
| subject / text / kp / level / err / occurred_on | text | 均按长度截断写入 | ✅ |
| mastered | boolean NOT NULL DEFAULT false | `!!m?.mastered` | ✅ |
| updated_at | timestamptz NOT NULL | ISO 时间 | ✅ |

索引：`work_mistakes_user_subject_idx (user_id, subject)` — 与「按用户 + 科目整科覆盖写」的模式匹配 ✅

### work_flywheel
| DDL 列 | 类型 | 代码写入 | 一致 |
|---|---|---|---|
| id | bigint IDENTITY PK | 不写入（自增） | ✅ |
| user_id | text NOT NULL FK | `userId` | ✅ |
| subject / version / grade / raw / corrected / engine | text | 均按长度截断写入 | ✅ |
| created_at | timestamptz NOT NULL | ISO 时间 | ✅ |

索引：`work_flywheel_user_idx (user_id, created_at DESC)` — 与按时间升序回放的查询匹配 ✅

## 3. 权限与隔离

- `REVOKE SELECT ON ALL TABLES IN SCHEMA public FROM anon` —— 阻断公开 Publishable Key 直读
- `GRANT SELECT, INSERT, UPDATE, DELETE ... TO service_role` —— 服务端独占
- 三张子表均 `ON DELETE CASCADE` 关联 `work_users`，删号即清数据 ✅

## 4. 观察项（不阻塞，建议后续处理）

| 编号 | 观察 | 风险 | 建议 |
|---|---|---|---|
| OBS-1 | `saveMistakes` 采用「先按 user+subject 全删，再批量 insert」，若同一批 records 中出现重复 id，会撞主键导致整批失败 | 低（前端正常不会产生重复 id） | 写入前按 id 去重 |
| OBS-2 | `work_flywheel` 每次同步「删全量再插入最多 500 条」，历史累积会反复重写 | 中（量级增长后写放大） | 改为按 CreatedAt 增量 upsert |
| OBS-3 | 迁移脚本只在国产库执行过；海外 Supabase 回滚路径未同步验证 work_* 是否存在 | 低（回滚属应急） | 回滚演练前先执行同一份迁移 |

## 5. 验证方式（可复现）

```bash
# 静态比对：确认四表 DDL 存在
grep -n "CREATE TABLE IF NOT EXISTS public.work_" cloudbase/migrations/*.sql

# 确认权限收紧
grep -n "REVOKE SELECT ON ALL TABLES" cloudbase/migrations/*.sql

# 确认字段被代码真实使用
grep -n 'from("work_' lib/work-db.ts
```

> 注：本次为**只读静态审计**，未对生产库执行任何迁移或查询。
> 若需实际验证表结构，应在隔离环境执行 `managePgDatabase(action="applyMigration")` 后查 `information_schema.columns`。
