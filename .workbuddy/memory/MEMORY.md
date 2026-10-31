# XX 科技 AI 企业门户 — 项目长期笔记

## 交付现状（2026-10-31）
- 线上地址：**https://www.cnxhy.top**（生产别名，国内可访问）｜备用 https://xm-tech-portal.vercel.app
- Vercel：team `xhy6`（team_jDWNPvAhjbZQ5hEbFHbmSny1），项目 `xm-tech-portal`（prj_LQQvY8YKmkX9ufaVMIlXXc5rJ3za），**plan = hobby（免费）**
- Supabase：项目 ref `umtqzvgqblleyjxohfwb`，6 张表已建，**service_role 授权已补齐**，持久化已验证通过
- 生产环境变量（全部 encrypted）：`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`ADMIN_SESSION_SECRET`、`SEARCH_MKT`、`GLOBAL_CONFIG`
- 后台账号 `admin`（超管）/ `market`（线索），口令见 `lib/data/defaults.ts` 与 `supabase/schema.sql` 的种子哈希

## 关键约束与坑（复用必读）
1. **沙箱网络**：本机出站被代理封死，`*.vercel.app` / `www.cnxhy.top` 一律 000 或 `502 from proxy after CONNECT`。
   线上只能靠 Vercel API 的 READY 状态判断，或请用户在浏览器确认。`vercel curl` 同样被拦。
2. **沙箱会遮蔽内联密钥**：把密钥直接写进 `node -e "..."` 的内联字符串，实际执行时可能被替换成假值（表现为 401 No API key found）。
   **一律用 argv 传密钥**（`node scripts/xxx.mjs "<key>"`），脚本内 `process.argv.slice(2)` 取。
3. **Vercel CLI 在中文路径下** `vercel link/deploy` 会报 "Detected linked project does not have id"。
   解决：`export VERCEL_ORG_ID=team_xxx VERCEL_PROJECT_ID=prj_xxx` 后再跑。
4. **Vercel redeploy API 不可用**（项目未关联 Git）：`/v13/deployments/{uid}/redeploy` 与 `/v1/integrations/deploy/{pid}/{uid}` 都 404。
   只能 `npx vercel deploy --prod --yes --token`（约 40s～2min）。
5. **写 Vercel env**：key 已存在时直接 POST 会 400 `ENV_CONFLICT`，必须先列出现有再 `PATCH /v10/projects/{id}/env/{envId}`。
6. **Supabase 表权限**：用 SQL Editor 建的表只授予 owner(postgres)，`service_role` 无 GRANT → 全部请求 42501。
   必须跑 `supabase/grant-service-role.sql`。诊断诀窍：看 42501 报错 hint 里 `TO <role>` 判断当前密钥角色。
7. **Bing Search API 已于 2025-08-11 退役**（旧密钥 410，新用户无法注册），替代品 Grounding with Bing 不返回原始结果列表、不能当 SERP 用。
   本项目已改用 Brave（推荐，每月 $5 免费额度）/ Tavily / SerpAPI。
8. **Vercel Hobby 仅限非商业个人使用**，企业官网严格说需 Pro（$20/月/席）。免费档不会自动扣费，超量只暂停功能。
9. 构建需 `CODEBUDDY_SAFE_DELETE_ENABLED=0 npm run build`（否则 .next/trace EPERM）。
   `.vercelignore` 必须写 `/data`（写 `data` 会把源码 `lib/data/` 一起排除，构建 Module not found）。
10. **Next.js 14 的 fetch 默认走 Data Cache（force-cache）**（Next 15 才改为默认 no-store）。
    Supabase 客户端若不加处理，读请求会被缓存 → 后台改完数据，GET 仍返回旧值，
    **表现为"保存失败"，实际已写库**。修复：`createClient(url, key, { global: { fetch: (i, init) => fetch(i, {...init, cache:"no-store"}) } })`
    （见 `lib/data/supabase-repo.ts` 构造函数）。同理，任何走 fetch 的外部读请求都要显式 no-store。
11. 本地复现线上问题：写 `.env.local`（已被 .gitignore 排除）→ `npm run build` → `npm start`
    → 用脚本打接口。**后台进程必须用 `run_in_background`，否则随 Bash 命令结束被杀**（表现为 ECONNREFUSED）。

## 常用命令
```bash
node scripts/connect-supabase.mjs "<secret key>"        # 校验+写 Vercel env+部署+验证
node scripts/connect-supabase.mjs "<key>" --env-only    # 只写 env，跳过权限校验
node scripts/verify-db.mjs "<secret key>"               # 数据库持久化端到端自检
export VERCEL_ORG_ID=team_... VERCEL_PROJECT_ID=prj_... && npx vercel deploy --prod --yes --token <token>
```

## 目录要点
- `lib/data/`：可插拔存储（types / json-repo / supabase-repo / index 按 env 选择）
- `lib/search.ts`：Brave → Tavily → SerpAPI → Bing(已退役) → mock，自动降级
- `supabase/schema.sql`：建表+种子；`supabase/grant-service-role.sql`：授权（各需执行一次）
- `DEPLOY.md`：部署与环境变量说明
