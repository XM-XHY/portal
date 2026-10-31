-- ============================================================
-- 修复：表已建好，但 service_role 没有权限（错误 42501）
-- ============================================================
-- 现象：用 sb_secret_... 访问 REST 接口返回 403 / 42501
--       "permission denied for table site_info"
--       hint: GRANT SELECT ON public.site_info TO service_role
--
-- 原因：通过 SQL Editor 建表时，表的权限只给了 owner（postgres），
--       PostgREST 使用的 service_role 角色未被授权。
--       （用 Supabase 控制台「Table Editor」建表则会自动授权，不会有此问题）
--
-- 用法：Supabase 控制台 → SQL Editor → 粘贴执行，只需一次。
-- ============================================================

-- 1) 授权 schema 访问
grant usage on schema public to service_role;

-- 2) 授权现有全部表 / 序列 / 函数
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- 3) 今后新建的表自动带上权限（避免再次踩坑）
alter default privileges for role postgres in schema public
  grant all on tables to service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to service_role;

-- 4) 刷新 PostgREST 的 schema 缓存（否则可能仍按旧权限响应）
notify pgrst, 'reload schema';

-- ============================================================
-- 验证：执行完上面后，可在本机运行
--   node scripts/connect-supabase.mjs "sb_secret_..."
-- 6 张表全部 OK 即表示权限已生效。
-- ============================================================
