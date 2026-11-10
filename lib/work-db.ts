/**
 * 作品中心（全科提分导师）统一数据层。
 *
 * 数据全部落在主站同一个数据库（国产 CloudBase PostgreSQL，回滚时是 Supabase）的
 * work_* 四张表，不再依赖浏览器 localStorage 作为唯一存储：
 *   work_users         账号档案、密码哈希、7 天试用起点
 *   work_entitlements  每笔已支付订单发放的会员权益（order_id 唯一，幂等）
 *   work_mistakes      错题库，按 (user_id, subject) 覆盖
 *   work_flywheel      拍照 OCR 纠错飞轮数据
 *
 * 安全边界：客户端**永远不能直接写权益/试用状态**。会员到期时间只由服务端在
 * 确认订单已支付后计算写入；`upsertLearning()` 只接受错题库和飞轮数据。
 */
import crypto from "node:crypto";
import { getWorkClient } from "@/lib/data";
import { WORK_TRIAL_DAYS } from "./work-plans";

const DAY = 86400000;

export type WorkUser = {
  id: string;
  account: string;
  pw_hash: string;
  created_at: string;
  trial_until: string;
  status: string;
  last_login_at: string | null;
};

export type WorkEntitlement = {
  id: string;
  user_id: string;
  plan: string;
  days: number;
  order_id: string;
  paid_until: string;
  created_at: string;
};

type Mistake = {
  id?: string;
  text?: string;
  kp?: string;
  level?: string;
  err?: string;
  date?: string;
  mastered?: boolean;
};

type FlyRow = {
  ts?: number;
  subj?: string;
  ver?: string;
  grade?: string;
  raw?: string;
  corrected?: string;
  engine?: string;
};

function db() {
  const c = getWorkClient();
  if (!c) throw new Error("数据库未配置（JsonRepo 本地模式不支持作品云端账号）");
  return c;
}

function newId(prefix: string): string {
  return prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 20);
}

/* ------------------------------ 密码 ------------------------------ */
// 格式：pbkdf2$<saltHex>$<hashHex>。作品原来的 djb2 只是本地一致性校验，
// 不能作为服务端密码存储（无盐、可碰撞），这里换成带盐 PBKDF2-SHA256。
function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(pw, salt, 120000, 32, "sha256");
  return `pbkdf2$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function checkPassword(pw: string, stored: string): boolean {
  const parts = String(stored || "").split("$");
  if (parts.length !== 3 || parts[0] !== "pbkdf2") return false;
  try {
    const salt = Buffer.from(parts[1], "hex");
    const expect = Buffer.from(parts[2], "hex");
    const actual = crypto.pbkdf2Sync(pw, salt, 120000, expect.length, "sha256");
    return expect.length === actual.length && crypto.timingSafeEqual(expect, actual);
  } catch {
    return false;
  }
}

function validAccount(s: unknown): string {
  const v = String(s || "").trim();
  if (v.length < 3 || v.length > 80) throw new Error("账号长度需为 3–80 个字符");
  return v;
}

function validPassword(s: unknown): string {
  const v = String(s || "");
  if (v.length < 6 || v.length > 128) throw new Error("密码长度需为 6–128 位");
  return v;
}

/* ------------------------------ 账号 ------------------------------ */
export async function findUserByAccount(account: string): Promise<WorkUser | null> {
  const { data, error } = await db()
    .from("work_users")
    .select("*")
    .eq("account", account)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as WorkUser) || null;
}

export async function findUserById(id: string): Promise<WorkUser | null> {
  const { data, error } = await db()
    .from("work_users")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as WorkUser) || null;
}

export async function registerUser(rawAccount: unknown, rawPw: unknown): Promise<WorkUser> {
  const account = validAccount(rawAccount);
  const pw = validPassword(rawPw);
  const existing = await findUserByAccount(account);
  if (existing) throw new Error("该账号已注册，请直接登录");

  const id = newId("wu_");
  const nowIso = new Date().toISOString();
  const trialUntil = new Date(Date.now() + WORK_TRIAL_DAYS * DAY).toISOString();
  const row = {
    id,
    account,
    pw_hash: hashPassword(pw),
    created_at: nowIso,
    trial_until: trialUntil,
    status: "active",
    last_login_at: nowIso,
  };
  const { error } = await db().from("work_users").insert(row);
  if (error) {
    // 并发注册撞唯一约束时给友好提示
    if (/duplicate|unique|23505/i.test(error.message)) throw new Error("该账号已注册，请直接登录");
    throw new Error(error.message);
  }
  return row as WorkUser;
}

export async function verifyLogin(rawAccount: unknown, rawPw: unknown): Promise<WorkUser> {
  const account = validAccount(rawAccount);
  const pw = String(rawPw || "");
  const user = await findUserByAccount(account);
  if (!user) throw new Error("账号不存在，请先注册");
  if (!checkPassword(pw, user.pw_hash)) throw new Error("密码不正确");
  const { error } = await db()
    .from("work_users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) throw new Error(error.message);
  return user;
}

export async function resetPassword(userId: string, rawPw: unknown): Promise<void> {
  const pw = validPassword(rawPw);
  const { error } = await db()
    .from("work_users")
    .update({ pw_hash: hashPassword(pw) })
    .eq("id", userId);
  if (error) throw new Error(error.message);
}

/* ------------------------------ 权益 ------------------------------ */
export async function listEntitlements(userId: string): Promise<WorkEntitlement[]> {
  const { data, error } = await db()
    .from("work_entitlements")
    .select("*")
    .eq("user_id", userId)
    .order("paid_until", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as WorkEntitlement[];
}

/** 会员到期时间 = 所有权益里最晚的 paid_until（毫秒） */
export async function paidUntilMs(userId: string): Promise<{ ms: number; plan: string | null; paidTs: number }> {
  const rows = await listEntitlements(userId);
  if (!rows.length) return { ms: 0, plan: null, paidTs: 0 };
  const latest = rows[0];
  return {
    ms: new Date(latest.paid_until).getTime() || 0,
    plan: latest.plan || null,
    paidTs: new Date(latest.created_at).getTime() || 0,
  };
}

/**
 * 幂等发放权益：同一订单号只发一次；续费在现有到期时间上叠加。
 * 由 /api/works/pay/status 与 /claim 在确认订单已支付后调用，不信任前端参数。
 */
export async function grantEntitlement(
  userId: string,
  plan: string,
  days: number,
  orderId: string
): Promise<WorkEntitlement> {
  const c = db();
  const { data: found, error: e1 } = await c
    .from("work_entitlements")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();
  if (e1) throw new Error(e1.message);
  if (found) return found as WorkEntitlement;

  const { ms: current } = await paidUntilMs(userId);
  const base = Math.max(Date.now(), current);
  const until = new Date(base + Math.max(1, Number(days) || 30) * DAY).toISOString();
  const row = {
    id: newId("we_"),
    user_id: userId,
    plan,
    days: Math.max(1, Number(days) || 30),
    order_id: orderId,
    paid_until: until,
    created_at: new Date().toISOString(),
  };
  const { error } = await c.from("work_entitlements").insert(row);
  if (error) {
    // 并发下撞唯一约束：说明已经发过了，回查返回
    if (/duplicate|unique|23505/i.test(error.message)) {
      const { data } = await c.from("work_entitlements").select("*").eq("order_id", orderId).maybeSingle();
      if (data) return data as WorkEntitlement;
    }
    throw new Error(error.message);
  }
  return row as WorkEntitlement;
}

/* --------------------------- 学习数据 --------------------------- */
export async function getMistakes(userId: string): Promise<Record<string, Mistake[]>> {
  const { data, error } = await db()
    .from("work_mistakes")
    .select("subject,text,kp,level,err,occurred_on,mastered,id")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const out: Record<string, Mistake[]> = {};
  for (const r of (data || []) as any[]) {
    const s = String(r.subject || "");
    if (!out[s]) out[s] = [];
    out[s].push({
      id: String(r.id || "").split("::").pop(),
      text: r.text || "",
      kp: r.kp || "",
      level: r.level || "B",
      err: r.err || "",
      date: r.occurred_on || "",
      mastered: !!r.mastered,
    });
  }
  return out;
}

/** 按学科整体覆盖错题库（客户端每次 save 提交当前学科的完整数组） */
export async function replaceMistakes(userId: string, subject: string, records: Mistake[]): Promise<void> {
  const c = db();
  const sub = String(subject || "").slice(0, 40);
  if (!sub) return;
  const { error: delErr } = await c.from("work_mistakes").delete().eq("user_id", userId).eq("subject", sub);
  if (delErr) throw new Error(delErr.message);

  const rows = (Array.isArray(records) ? records : []).slice(0, 2000).map((m) => ({
    id: `${userId}::${sub}::${String(m?.id || newId("err_"))}`,
    user_id: userId,
    subject: sub,
    text: String(m?.text || "").slice(0, 4000),
    kp: String(m?.kp || "").slice(0, 200),
    level: String(m?.level || "B").slice(0, 20),
    err: String(m?.err || "").slice(0, 200),
    occurred_on: String(m?.date || "").slice(0, 20),
    mastered: !!m?.mastered,
    updated_at: new Date().toISOString(),
  }));
  if (!rows.length) return;
  const { error } = await c.from("work_mistakes").insert(rows);
  if (error) throw new Error(error.message);
}

export async function getFlywheel(userId: string): Promise<FlyRow[]> {
  const { data, error } = await db()
    .from("work_flywheel")
    .select("created_at,subject,version,grade,raw,corrected,engine")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw new Error(error.message);
  return ((data || []) as any[]).map((r) => ({
    ts: new Date(r.created_at).getTime() || 0,
    subj: r.subject || "",
    ver: r.version || "",
    grade: r.grade || "",
    raw: r.raw || "",
    corrected: r.corrected || "",
    engine: r.engine || "",
  }));
}

/** 飞轮数据整体覆盖（数据量小，避免 identity 主键重复插入） */
export async function replaceFlywheel(userId: string, rows: FlyRow[]): Promise<void> {
  const c = db();
  const { error: delErr } = await c.from("work_flywheel").delete().eq("user_id", userId);
  if (delErr) throw new Error(delErr.message);

  const list = (Array.isArray(rows) ? rows : []).slice(-500).map((r) => ({
    user_id: userId,
    subject: String(r?.subj || "").slice(0, 40),
    version: String(r?.ver || "").slice(0, 40),
    grade: String(r?.grade || "").slice(0, 40),
    raw: String(r?.raw || "").slice(0, 2000),
    corrected: String(r?.corrected || "").slice(0, 2000),
    engine: String(r?.engine || "").slice(0, 40),
    created_at: new Date(Number(r?.ts) > 0 ? Number(r.ts) : Date.now()).toISOString(),
  }));
  if (!list.length) return;
  const { error } = await c.from("work_flywheel").insert(list);
  if (error) throw new Error(error.message);
}

/**
 * 组装返回给作品的完整云端状态。auth 是作品内部账号档案格式，
 * 服务端据此覆盖浏览器缓存，保证「换设备登录账号还在、会员不缩水」。
 */
export async function buildWorkState(userId: string) {
  const user = await findUserById(userId);
  if (!user) return null;
  const ent = await paidUntilMs(userId);
  const trialUntil = new Date(user.trial_until).getTime() || 0;
  const createdMs = new Date(user.created_at).getTime() || Date.now();
  const isPaid = ent.ms > Date.now();
  return {
    account: user.account,
    userId: user.id,
    trialUntil,
    paidUntil: ent.ms,
    auth: {
      phone: user.account,
      passHash: "",
      // 作品用 ts + 7 天算试用终点，服务端把 ts 反推成与 trial_until 对齐
      ts: trialUntil ? trialUntil - WORK_TRIAL_DAYS * DAY : createdMs,
      isPaid,
      plan: ent.plan,
      paidTs: ent.paidTs,
      paidUntil: ent.ms,
    },
    mistakes: await getMistakes(userId),
    flywheel: await getFlywheel(userId),
  };
}
