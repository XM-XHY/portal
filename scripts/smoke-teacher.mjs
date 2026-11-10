// 安全冒烟测试：仅验证接口连通与校验，不创建真实账号。
// 用法：node scripts/smoke-teacher.mjs
const BASE = "https://www.cnxhy.top";

async function req(path, method = "GET", body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text().catch(() => "");
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

(async () => {
  // 1) 注册页可见
  const regPage = await req("/register");
  console.log("[GET /register]", regPage.status, regPage.text.includes("教师注册") ? "含「教师注册」文案 ✓" : "文案缺失 ✗");

  // 2) 注册接口：重复用户名（admin 已存在）→ 应 400 且不创建账号
  const dup = await req("/api/auth/register", "POST", { username: "admin", password: "Abcd1234" });
  console.log("[POST /api/auth/register 重复名]", dup.status, JSON.stringify(dup.json));

  // 3) 注册接口：弱密码 → 应 400（校验生效，不创建账号）
  const weak = await req("/api/auth/register", "POST", { username: "teacher_smoke", password: "123" });
  console.log("[POST /api/auth/register 弱密码]", weak.status, JSON.stringify(weak.json));

  // 4) /api/auth/me 未登录 → 401（确认鉴权链路正常）
  const me = await req("/api/auth/me");
  console.log("[GET /api/auth/me 匿名]", me.status);
})();
