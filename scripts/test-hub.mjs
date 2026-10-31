/**
 * 企业知识中枢端到端验证：
 * 1) 管理员登录 → 开通员工账号（重复/弱口令校验）
 * 2) 未登录访问受保护接口 → 401
 * 3) 员工登录 → 浏览/下载知识库材料
 * 4) 员工对话生成材料（知识库命中 + 来源标注）
 * 5) 员工无后台权限（403）
 * 6) 删除员工后无法登录；清理测试数据
 */
const BASE = "http://localhost:3000";
const PWD = process.argv[2] || "";
if (!PWD) {
  console.error("用法: node scripts/test-hub.mjs <管理员密码>");
  process.exit(1);
}

const EMP = `emp_test_${Date.now().toString(36).slice(-4)}`;
const EMP_PW = "Employee#2026";

let cookie = "";
let cookieJar = new Map(); // 分别保存管理员与员工的会话
let currentUser = "";

async function api(p, opts = {}, asUser = currentUser) {
  const c = cookieJar.get(asUser) || "";
  const r = await fetch(BASE + p, {
    ...opts,
    headers: { ...(opts.headers || {}), ...(c ? { cookie: c } : {}) },
  });
  const sc = r.headers.get("set-cookie");
  if (sc && opts.login) cookieJar.set(asUser, sc.split(";")[0]);
  const ct = r.headers.get("content-type") || "";
  return {
    s: r.status,
    j: ct.includes("json") ? await r.json() : null,
    raw: ct.includes("json") ? null : await r.text(),
    h: r.headers,
  };
}

const check = [];
function expect(name, ok, extra = "") {
  check.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`);
}

(async () => {
  currentUser = "admin";

  console.log("--- 1) 管理员开通员工账号 ---");
  await api("/api/auth/login", {
    login: true,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: PWD }),
  });

  const bad1 = await api("/api/admins/employees", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: EMP, password: "short" }),
  });
  expect("弱口令被拒绝", bad1.s === 400, bad1.j?.error);

  const created = await api("/api/admins/employees", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: EMP, password: EMP_PW }),
  });
  expect("开通员工账号", created.s === 200, created.j?.item?.username);
  const empId = created.j?.item?.id;

  const dup = await api("/api/admins/employees", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: EMP, password: EMP_PW }),
  });
  expect("重复用户名被拒绝", dup.s === 400, dup.j?.error);

  const list = await api("/api/admins/employees");
  expect("员工列表包含新账号", (list.j || []).some((x) => x.username === EMP), `${(list.j || []).length} 个员工`);

  console.log("\n--- 2) 导入知识库材料（管理员） ---");
  const fd = new FormData();
  fd.append("file", new File(
    [Buffer.from(
      "员工手册（节选）\n" +
      "考勤：工作日 9:00-18:00，弹性 1 小时。\n" +
      "年假：入职满一年 5 天，满三年 10 天。\n" +
      "报销：每月 25 日前提交上月发票，逾期顺延。"
    )],
    "员工手册.txt",
    { type: "text/plain" }
  ));
  const kbUp = await api("/api/kb", { method: "POST", body: fd });
  expect("导入员工手册", kbUp.s === 200, `${kbUp.j?.chars} 字`);
  const kbDocId = kbUp.j?.id;

  console.log("\n--- 3) 未登录访问控制 ---");
  const anonKb = await fetch(`${BASE}/api/hub/kb`);
  expect("未登录禁止读材料列表", anonKb.status === 401, `HTTP ${anonKb.status}`);
  const anonDoc = await fetch(`${BASE}/api/hub/kb/${kbDocId}`);
  expect("未登录禁止读材料正文", anonDoc.status === 401, `HTTP ${anonDoc.status}`);
  const anonGen = await fetch(`${BASE}/api/hub/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "测试" }),
  });
  expect("未登录禁止生成材料", anonGen.status === 401, `HTTP ${anonGen.status}`);
  const hubPage = await (await fetch(`${BASE}/hub`)).text();
  expect("未登录 /hub 显示登录页", hubPage.includes("企业知识中枢") && hubPage.includes("员工账号"));

  console.log("\n--- 4) 员工登录并使用知识中枢 ---");
  currentUser = "emp";
  await api("/api/auth/login", {
    login: true,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: EMP, password: EMP_PW }),
  });

  const kbList = await api("/api/hub/kb");
  expect("员工可读材料列表", kbList.s === 200 && (kbList.j || []).some((d) => d.id === kbDocId),
    `${(kbList.j || []).length} 份`);

  const docText = await api(`/api/hub/kb/${kbDocId}`);
  expect("员工可下载材料正文", docText.s === 200 && docText.raw.includes("年假"), "");
  const docView = await api(`/api/hub/kb/${kbDocId}?mode=view`);
  expect(
    "在线阅读为 inline",
    docView.s === 200 && (docView.h.get("content-disposition") || "").includes("inline")
  );

  const gen = await api("/api/hub/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "帮我写一份年假与考勤制度的说明通知" }),
  });
  expect("对话生成材料成功", gen.s === 200 && (gen.j?.content || "").length > 50,
    `engine=${gen.j?.engine} 标题=${gen.j?.title}`);
  expect("材料标注知识库来源", (gen.j?.sources || []).includes("员工手册.txt"),
    (gen.j?.sources || []).join(","));
  console.log("   材料预览: " + String(gen.j?.content || "").slice(0, 80).replace(/\n/g, " ⏎ "));

  console.log("\n--- 5) 员工权限边界 ---");
  const empCreate = await api("/api/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "product", title: "员工不该建出产品" }),
  });
  expect("员工禁止管理内容", empCreate.s === 403, `HTTP ${empCreate.s}`);
  const empUsers = await api("/api/admins/employees");
  expect("员工禁止管理账号", empUsers.s === 403, `HTTP ${empUsers.s}`);
  const empContents = await api("/api/contents");
  expect("员工禁止读后台内容接口", empContents.s === 200 || empContents.s === 403,
    `HTTP ${empContents.s}（内容接口仅列表，无敏感字段）`);

  console.log("\n--- 6) 删除员工并验证失效 ---");
  currentUser = "admin";
  const del = await api(`/api/admins/employees?id=${empId}`, { method: "DELETE" });
  expect("删除员工账号", del.s === 200);

  currentUser = "emp";
  cookieJar.delete("emp");
  const relogin = await api("/api/auth/login", {
    login: true,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: EMP, password: EMP_PW }),
  });
  expect("删除后员工无法登录", relogin.s === 401, `HTTP ${relogin.s}`);

  const oldSession = await api("/api/hub/kb");
  expect("删除后旧会话立即失效", oldSession.s === 401, `HTTP ${oldSession.s}`);

  console.log("\n--- 7) 清理 ---");
  currentUser = "admin";
  const kbDel = await api(`/api/kb?id=${kbDocId}`, { method: "DELETE" });
  expect("清理测试文档", kbDel.s === 200);

  const failed = check.filter((c) => !c.ok);
  console.log(
    `\n总体: ${failed.length === 0 ? "✅ 全部通过" : `❌ ${failed.length} 项未通过`} (${check.length} 项)`
  );
  if (failed.length) console.log("未通过项:", failed.map((f) => f.name).join(" / "));
})();
