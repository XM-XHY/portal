-- ============================================================
-- 迁移：为 admins 表新增 perms 列（逐账号权限覆盖）
-- 适用：已通过 schema.sql 建表、但还没有 perms 列的生产库。
-- 用法：在 Supabase 控制台 → SQL Editor 中执行本文件（仅几行）。
-- 该列可空；为 NULL 时表示「沿用角色默认权限」，
-- 写入具体数组时表示对该账号的权限覆盖。
-- ============================================================

alter table if exists admins
  add column if not exists perms jsonb;

-- 校验：确认列已存在
-- select column_name, data_type
-- from information_schema.columns
-- where table_name = 'admins' and column_name = 'perms';
