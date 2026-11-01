// 排课系统端到端验证脚本（本地运行：先 npm start，再 node scripts/test-schedule.mjs）
const BASE = process.env.BASE || "http://localhost:3000";
const PW = process.env.ADMIN_PW || "#XHY-@350211";

let pass = 0, fail = 0;
function ok(name, cond, extra = "") {
  if (cond) { pass++; console.log("  ✅", name, extra); }
  else { fail++; console.log("  ❌", name, extra); }
}

const jar = {};
async function call(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(BASE + path, { ...opts, headers });
  const sc = res.headers.get("set-cookie");
  if (sc) {
    const m = sc.match(/([^=;\s]+)=([^;]+)/);
    if (m) jar[m[1]] = m[2];
  }
  let data = null;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) data = await res.json().catch(() => null);
  return { s: res.status, data, res, ct };
}

function csvBlob(content, name) {
  return new Blob(["﻿" + content], { type: "text/csv;charset=utf-8" });
}

async function importKind(kind, csv) {
  const fd = new FormData();
  fd.append("kind", kind);
  fd.append("file", csvBlob(csv), `${kind}.csv`);
  return call("/api/schedule/import", { method: "POST", body: fd });
}

const S = {
  teachers: "教师工号,姓名,可授科目,周最大课时,不排课节次\n" +
    "T01,张伟,数学,16,\nT02,李娜,语文|历史,14,\nT03,王芳,英语,16,\n" +
    "T04,孙明,物理,14,\nT05,周涛,化学,14,\nT06,吴敏,生物,12,\n" +
    "T07,郑华,地理,12,\nT08,钱进,政治,12,\nT09,赵强,体育,10,\n",
  classes: "班级ID,班级名称,学生人数\nC01,高一(1)班,48\nC02,高二(1)班,50\n",
  subjects: "班级ID,科目,每周课时,需实验室\n" +
    "C01,数学,6,否\nC01,语文,5,否\nC01,英语,5,否\nC01,物理,4,是\nC01,化学,3,是\nC01,生物,2,否\nC01,地理,2,否\nC01,历史,2,否\nC01,政治,2,否\nC01,体育,2,否\n" +
    "C02,数学,6,否\nC02,语文,5,否\nC02,英语,5,否\nC02,物理,4,是\nC02,化学,3,是\nC02,生物,2,否\nC02,地理,2,否\nC02,历史,2,否\nC02,政治,2,否\nC02,体育,2,否\n",
  rooms: "教室ID,教室名称,容量,类型\nR01,101教室,55,普通\nR02,102教室,55,普通\nR03,103教室,50,普通\nL01,物理实验室,40,实验室\nL02,化学实验室,40,实验室\n",
  oldsched: "班级ID,星期,节次,科目,教师工号,教室ID\n" +
    "C01,1,1,数学,T01,R01\nC01,1,2,语文,T02,R01\nC01,1,3,英语,T03,R02\n" +
    "C01,2,1,数学,T01,R01\nC01,2,2,物理,T04,L01\nC01,2,3,化学,T05,L02\n" +
    "C01,3,1,语文,T02,R01\nC01,3,2,英语,T03,R02\nC01,3,3,生物,T06,R03\n" +
    "C02,1,1,数学,T01,R02\nC02,1,2,语文,T02,R02\nC02,1,3,英语,T03,R01\n",
};

(async () => {
  console.log("== 排课系统端到端验证 ==");
  // 1) 未登录应 401
  const noAuth = await call("/api/schedule");
  ok("未登录读取排课状态返回 401", noAuth.s === 401);

  // 2) 登录
  const login = await call("/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: PW }),
  });
  ok("管理员登录成功", login.s === 200);

  // 3) 模板下载
  const TMPL_KEY = { teachers: "教师工号", classes: "班级ID", subjects: "科目", rooms: "教室ID", oldsched: "班级ID" };
  for (const k of ["teachers", "classes", "subjects", "rooms", "oldsched"]) {
    const t = await call(`/api/schedule/template?kind=${k}`);
    const body = await t.res.text();
    ok(`模板 ${k} 下载 200 且含表头`, t.s === 200 && body.includes(TMPL_KEY[k]), `len=${body.length}`);
  }

  // 4) 导入
  for (const [k, csv] of Object.entries(S)) {
    const r = await importKind(k, csv);
    ok(`导入 ${k}`, r.s === 200 && r.data?.count > 0, `count=${r.data?.count}`);
  }

  // 5) 读取状态
  const st = await call("/api/schedule");
  ok("读取状态含数据", st.data?.classes?.length === 2 && st.data?.teachers?.length === 9 && st.data?.subjects?.length === 20,
    `classes=${st.data?.classes?.length} teachers=${st.data?.teachers?.length} subjects=${st.data?.subjects?.length}`);

  // 6) 生成
  const gen = await call("/api/schedule/generate", { method: "POST" });
  ok("一键排课成功", gen.s === 200 && !!gen.data?.result?.perClass, `conflicts=${gen.data?.result?.conflicts?.length}`);
  const r2 = await call("/api/schedule");
  const c01 = r2.data?.result?.perClass?.C01;
  let filled = 0;
  if (c01) for (const row of c01) for (const c of row) if (c) filled++;
  ok("C01 课表已填充", filled > 20, `filled=${filled}`);

  // 7) 分享
  const sh = await call("/api/schedule/share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "测试分享" }) });
  ok("创建分享链接", sh.s === 200 && !!sh.data?.token, `token=${sh.data?.token}`);
  const pub = await call(`/api/schedule/share/${sh.data.token}`);
  ok("公开读取分享快照", pub.s === 200 && pub.data?.classes?.length === 2);
  const pub404 = await call("/api/schedule/share/nope");
  ok("无效分享链接 404", pub404.s === 404);

  // 8) 导出 Excel（带 token，公开）
  const exp = await call(`/api/schedule/export?token=${sh.data.token}`);
  const buf = Buffer.from(await exp.res.arrayBuffer());
  ok("导出 Excel 为 xlsx", exp.s === 200 && exp.ct.includes("spreadsheetml") && buf.length > 1000, `len=${buf.length} ct=${exp.ct}`);

  // 9) 清理分享快照（通过直接 DELETE 不可，这里仅验证公开导出无需登录即可）
  const expNoAuth = await (async () => {
    const r = await fetch(BASE + `/api/schedule/export?token=${sh.data.token}`);
    return r.status;
  })();
  ok("公开导出无需登录", expNoAuth === 200);

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("脚本异常", e); process.exit(2); });
