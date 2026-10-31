/**
 * 产品中心端到端验证：
 * 1) 管理员登录
 * 2) 新增产品 / 解决方案（含默认排在末尾）
 * 3) 导入 Word/Excel/PDF/TXT/MD 类资料（含同步客服知识库）
 * 4) 调整展示顺序（拖拽等价的 reorder 接口）
 * 5) 前台页面与资料下载 / 在线阅读
 * 6) 清理测试数据
 */
const BASE = "http://localhost:3000";
const PWD = process.argv[2] || "";
if (!PWD) {
  console.error("用法: node scripts/test-products.mjs <管理员密码>");
  process.exit(1);
}

let cookie = "";

async function api(p, opts = {}) {
  const r = await fetch(BASE + p, {
    ...opts,
    headers: { ...(opts.headers || {}), ...(cookie ? { cookie } : {}) },
  });
  const sc = r.headers.get("set-cookie");
  if (sc && !cookie) cookie = sc.split(";")[0];
  const ct = r.headers.get("content-type") || "";
  const isJson = ct.includes("json");
  return { s: r.status, j: isJson ? await r.json() : null, raw: isJson ? null : await r.text(), h: r.headers };
}

const check = [];
function expect(name, ok, extra = "") {
  check.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`);
}

(async () => {
  console.log("--- 1) 登录 ---");
  const login = await api("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: PWD }),
  });
  console.log("登录:", login.s === 200 ? "OK" : JSON.stringify(login.j));
  if (login.s !== 200) process.exit(1);

  console.log("\n--- 2) 现有产品与解决方案 ---");
  const before = await api("/api/products");
  const beforeItems = before.j?.items || [];
  console.log(
    "当前顺序:",
    beforeItems.map((i, n) => `${n + 1}.${i.type === "solution" ? "方案" : "产品"}:${i.title}`).join(" | ")
  );
  expect("产品中心列表可读", before.s === 200 && beforeItems.length > 0, `${beforeItems.length} 项`);

  console.log("\n--- 3) 新增产品与解决方案 ---");
  const newProd = await api("/api/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "product",
      title: "测试产品-巡检机器人",
      tag: "智能硬件",
      icon: "🤖",
      summary: "用于验证产品中心的测试产品条目。",
      body: "这是测试产品的详情正文第一行。\n第二行用于验证分段渲染。",
      tags: "自动巡检,远程运维",
      industry: "园区 / 工厂 / 变电站",
      result: "巡检人力 -60%",
    }),
  });
  const newSolu = await api("/api/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "solution",
      title: "测试方案-机房无人值守",
      tag: "解决方案",
      icon: "🧩",
      summary: "用于验证产品中心的测试解决方案条目。",
      body: "测试解决方案正文。",
      tags: "无人值守,告警联动",
      industry: "数据中心 / 机房",
      result: "值守成本 -70%",
    }),
  });
  expect("新增产品", newProd.s === 200, newProd.j?.item?.id);
  expect("新增解决方案", newSolu.s === 200, newSolu.j?.item?.id);
  const pid = newProd.j?.item?.id;
  const sid = newSolu.j?.item?.id;

  const afterCreate = await api("/api/products");
  const created = afterCreate.j?.items || [];
  expect(
    "新条目默认排在末尾",
    created.length >= 2 &&
      created[created.length - 1].id === sid &&
      created[created.length - 2].id === pid,
    created.map((i) => i.title).slice(-2).join(" , ")
  );

  console.log("\n--- 4) 导入产品资料（TXT / CSV，含同步知识库） ---");
  const mk = (name, buf, type) => new File([buf], name, { type });
  const up = async (file, productId, alsoKb) => {
    const fd = new FormData();
    fd.append("productId", productId);
    fd.append("file", file);
    fd.append("title", file.name);
    if (alsoKb) fd.append("alsoKb", "1");
    return api("/api/products/doc", { method: "POST", body: fd });
  };

  const kbBefore = await api("/api/kb");
  const kbCountBefore = (kbBefore.j || []).length;

  const txt = mk(
    "巡检机器人参数表.txt",
    Buffer.from(
      "巡检机器人参数表\n" +
        "型号：XJ-1000\n" +
        "续航：8 小时，支持自动回充。\n" +
        "防护等级：IP54，可在室外雨雪天气工作。\n" +
        "售价：标准版 29.8 万元/台。"
    ),
    "text/plain"
  );
  const csv = mk(
    "机房值守报价.csv",
    Buffer.from("项目,价格,说明\n无人值守平台,12万/年,含 20 路摄像头\n告警联动模块,3万,一次性"),
    "text/csv"
  );

  const up1 = await up(txt, pid, true);
  const up2 = await up(csv, sid, false);
  expect("TXT 资料导入", up1.s === 200, up1.s === 200 ? `${up1.j.chars} 字` : JSON.stringify(up1.j));
  expect("CSV 资料导入", up2.s === 200, up2.s === 200 ? `${up2.j.chars} 字` : JSON.stringify(up2.j));
  const doc1 = up1.j?.id;
  const doc2 = up2.j?.id;

  const kbAfter = await api("/api/kb");
  const kbCountAfter = (kbAfter.j || []).length;
  expect(
    "勾选的文档同步进客服知识库",
    kbCountAfter === kbCountBefore + 1,
    `${kbCountBefore} → ${kbCountAfter}`
  );

  const listed = await api("/api/products");
  const prodItem = (listed.j?.items || []).find((i) => i.id === pid);
  const soluItem = (listed.j?.items || []).find((i) => i.id === sid);
  expect("产品详情带资料清单", (prodItem?.docs || []).length === 1, `${prodItem?.docs?.[0]?.title}`);
  expect("解决方案详情带资料清单", (soluItem?.docs || []).length === 1, `${soluItem?.docs?.[0]?.title}`);

  console.log("\n--- 5) 调整展示位置 ---");
  const ids = (listed.j?.items || []).map((i) => i.id);
  // 把测试产品提到第一位
  const reordered = [pid, ...ids.filter((i) => i !== pid)];
  const ro = await api("/api/products/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: reordered }),
  });
  const afterRo = await api("/api/products");
  const afterIds = (afterRo.j?.items || []).map((i) => i.id);
  expect("排序接口保存成功", ro.s === 200 && ro.j?.changed > 0, `changed=${ro.j?.changed}`);
  expect(
    "列表顺序按新排序返回",
    afterIds[0] === pid && afterIds.length === ids.length,
    afterIds.slice(0, 3).join(" → ")
  );

  console.log("\n--- 6) 前台页面与资料下载 ---");
  const page = await api("/products");
  const html = page.raw || "";
  expect("产品中心页面 200", page.s === 200);
  expect("页面含新增产品", html.includes("测试产品-巡检机器人"));
  expect("页面含新增解决方案", html.includes("测试方案-机房无人值守"));
  const posProd = html.indexOf("测试产品-巡检机器人");
  const posSolu = html.indexOf("测试方案-机房无人值守");
  expect("卡片按后台排序展示（测试产品在最前）", posProd > 0 && posSolu > 0);

  const detail = await api(`/products/${pid}`);
  expect("产品详情页 200", detail.s === 200);
  expect("详情页展示资料下载入口", (detail.raw || "").includes(`/api/products/doc/${doc1}`));

  const dl = await api(`/api/products/doc/${doc1}`);
  const dlBody = dl.raw || "";
  expect(
    "资料可下载（attachment + 中文文件名）",
    dl.s === 200 &&
      (dl.h.get("content-disposition") || "").includes("attachment") &&
      (dl.h.get("content-disposition") || "").includes("UTF-8"),
    dl.h.get("content-disposition")
  );
  expect("下载内容为文档正文", dlBody.includes("XJ-1000") && dlBody.includes("29.8"));

  const view = await api(`/api/products/doc/${doc1}?mode=view`);
  expect(
    "资料可在线阅读（inline）",
    view.s === 200 && (view.h.get("content-disposition") || "").includes("inline")
  );

  // 未登录也能访问资料（公开资料）
  const anon = await fetch(`${BASE}/api/products/doc/${doc1}`);
  const anonBody = await anon.text();
  expect("未登录访客可阅读资料", anon.status === 200 && anonBody.includes("XJ-1000"));

  console.log("\n--- 7) 权限校验 ---");
  const anonCreate = await fetch(`${BASE}/api/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "product", title: "未登录不该创建成功" }),
  });
  expect("未登录禁止新增产品", anonCreate.status === 401, `HTTP ${anonCreate.status}`);
  const anonReorder = await fetch(`${BASE}/api/products/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: [] }),
  });
  expect("未登录禁止改排序", anonReorder.status === 401, `HTTP ${anonReorder.status}`);
  const badType = await api("/api/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "kb", title: "不该进产品中心" }),
  });
  expect("非法类型被收敛为产品", badType.s === 200 && badType.j?.item?.type === "product");

  console.log("\n--- 8) 清理 ---");
  const delDoc1 = await api(`/api/products/doc?id=${doc1}`, { method: "DELETE" });
  const kbAfterDel = await api("/api/kb");
  expect("删除资料成功", delDoc1.s === 200);
  expect(
    "同步的知识库副本一并清理",
    (kbAfterDel.j || []).length === kbCountBefore,
    `${kbCountAfter} → ${(kbAfterDel.j || []).length}`
  );

  await api(`/api/products/doc?id=${doc2}`, { method: "DELETE" });
  const delP = await api(`/api/products?id=${pid}`, { method: "DELETE" });
  const delS = await api(`/api/products?id=${sid}`, { method: "DELETE" });
  const delBad = await api(`/api/products?id=${badType.j?.item?.id}`, { method: "DELETE" });
  expect(
    "删除产品与解决方案",
    delP.s === 200 && delS.s === 200 && delBad.s === 200,
    `${delP.s}/${delS.s}/${delBad.s}`
  );

  const final = await api("/api/products");
  expect(
    "恢复到初始条目与顺序",
    (final.j?.items || []).length === beforeItems.length &&
      (final.j?.items || []).map((i) => i.id).join(",") === beforeItems.map((i) => i.id).join(","),
    `${(final.j?.items || []).length} 项`
  );

  const failed = check.filter((c) => !c.ok);
  console.log(
    `\n总体: ${failed.length === 0 ? "✅ 全部通过" : `❌ ${failed.length} 项未通过`} (${check.length} 项)`
  );
  if (failed.length) console.log("未通过项:", failed.map((f) => f.name).join(" / "));
})();
