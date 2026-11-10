-- 1. 迁移兼容：旧 Supabase 的 admins 有 perms 列（逐账号权限），国产库缺，
--    带 perms 的 upsert 会被 PostgREST 以 PGRST204 拒绝。
ALTER TABLE public.admins ADD COLUMN IF NOT EXISTS perms jsonb;

-- 2. 安全加固：主站所有数据库读写都在服务端完成（API Key -> service_role），
--    浏览器从不直连 public 表。平台默认授予 anon 的 SELECT 会让公开的
--    Publishable Key 读到管理员密码哈希、订单、线索与公众号绑定数据。
REVOKE SELECT ON ALL TABLES IN SCHEMA public FROM anon;

-- 3. 作品并入后的 C 端会员与学习数据（当前为空表，服务端独占）
CREATE TABLE IF NOT EXISTS public.work_users (
  id text PRIMARY KEY,
  account text NOT NULL UNIQUE,
  pw_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  trial_until timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active',
  last_login_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.work_entitlements (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES public.work_users(id) ON DELETE CASCADE,
  plan text NOT NULL,
  days integer NOT NULL,
  order_id text NOT NULL UNIQUE,
  paid_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS work_entitlements_user_idx ON public.work_entitlements (user_id, paid_until DESC);

CREATE TABLE IF NOT EXISTS public.work_mistakes (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES public.work_users(id) ON DELETE CASCADE,
  subject text NOT NULL,
  text text NOT NULL DEFAULT '',
  kp text NOT NULL DEFAULT '',
  level text NOT NULL DEFAULT 'B',
  err text NOT NULL DEFAULT '',
  occurred_on text NOT NULL DEFAULT '',
  mastered boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS work_mistakes_user_subject_idx ON public.work_mistakes (user_id, subject);

CREATE TABLE IF NOT EXISTS public.work_flywheel (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id text NOT NULL REFERENCES public.work_users(id) ON DELETE CASCADE,
  subject text NOT NULL DEFAULT '',
  version text NOT NULL DEFAULT '',
  grade text NOT NULL DEFAULT '',
  raw text NOT NULL DEFAULT '',
  corrected text NOT NULL DEFAULT '',
  engine text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS work_flywheel_user_idx ON public.work_flywheel (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_users, public.work_entitlements, public.work_mistakes, public.work_flywheel TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
REVOKE ALL ON public.work_users, public.work_entitlements, public.work_mistakes, public.work_flywheel FROM anon, authenticated, PUBLIC;

-- service_role 带 BYPASSRLS；启用 RLS 且不建 policy，可确保这些表只能由服务端访问。
ALTER TABLE public.work_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_mistakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_flywheel ENABLE ROW LEVEL SECURITY;
