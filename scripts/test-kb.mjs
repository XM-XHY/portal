/**
 * 知识库端到端验证：
 * 1) 管理员登录
 * 2) 导入 TXT / PDF / CSV 三种文档
 * 3) /api/chat 提问 → 验证依据知识库文档回答（engine=kb）
 * 4) 清理测试文档
 */
const BASE = "http://localhost:3000";
const PWD = process.argv[2] || "";
if (!PWD) { console.error("用法: node scripts/test-kb.mjs <管理员密码>"); process.exit(1); }

let cookie = "";

async function api(p, opts = {}) {
  const r = await fetch(BASE + p, {
    ...opts,
    headers: { ...(opts.headers || {}), ...(cookie ? { cookie } : {}) },
  });
  const sc = r.headers.get("set-cookie");
  if (sc && !cookie) cookie = sc.split(";")[0];
  const ct = r.headers.get("content-type") || "";
  return { s: r.status, j: ct.includes("json") ? await r.json() : null };
}

/* 最小 PDF 生成器（同 scripts/test-parsers.cjs） */
function buildPdf(text) {
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${text.length + 20} >>\nstream\nBT /F1 24 Tf 72 700 Td (${text}) Tj ET\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((b, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${b}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => { out += String(o).padStart(10, "0") + " 00000 n \n"; });
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, "latin1");
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

  const mk = (name, buf, type) => new File([buf], name, { type });

  const files = [
    mk("产品手册.txt", Buffer.from(
      "星际一号巡检机器人产品手册\n" +
      "售价：标准版 29.8 万元/台，年租 3.5 万元。\n" +
      "质保：整机质保两年，电池终身维护。\n" +
      "交付周期：合同生效后 45 个工作日内到货。"
    ), "text/plain"),
    mk("售后政策.pdf", buildPdf("After-sales: 7x24 remote support, on-site service within 48 hours, spare parts shipped in 3 days."), "application/pdf"),
    mk("报价表.csv", Buffer.from("产品,价格,备注\n智能客服Copilot,8万/年,含10个坐席\n数据中台,25万起,私有化另计"), "text/csv"),
  ];

  const uploaded = [];
  for (const f of files) {
    const fd = new FormData();
    fd.append("file", f);
    const r = await api("/api/kb", { method: "POST", body: fd });
    console.log(`导入 ${f.name}:`, r.s, r.s === 200 ? `${r.j.chars} 字` : JSON.stringify(r.j));
    if (r.s === 200) uploaded.push(r.j.id);
  }

  console.log("\n--- 文档列表 ---");
  const list = await api("/api/kb");
  console.log("列表:", list.s, (list.j || []).map((d) => `${d.title}(${d.chars}字)`).join(" / "));

  console.log("\n--- 2) 知识库问答验证 ---");
  // 等限流窗口过去
  const ask = async (q) => {
    await new Promise((r) => setTimeout(r, 5200));
    const r = await api("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: q }] }),
    });
    console.log(`Q: ${q}\n   → HTTP ${r.s} engine=${r.j?.engine} 来源=[${(r.j?.kbSources || []).join(",")}]`);
    console.log("   " + String(r.j?.reply || r.j?.error || "").slice(0, 120).replace(/\n/g, " ⏎ "));
    return r.j;
  };

  const a1 = await ask("星际一号机器人多少钱？质保多久？");
  const ok1 = a1?.reply?.includes("29.8");
  console.log("   TXT 知识命中:", ok1 ? "✅" : "❌");

  const a2 = await ask("售后响应时间是多久？");
  const ok2 = a2?.reply && (a2.reply.includes("48") || a2.reply.includes("hours") || a2.reply.includes("小时"));
  console.log("   PDF 知识命中:", ok2 ? "✅" : "❌");

  const a3 = await ask("智能客服 Copilot 报价多少？");
  const ok3 = a3?.reply?.includes("8万") || a3?.reply?.includes("8 万");
  console.log("   CSV 知识命中:", ok3 ? "✅" : "❌");

  console.log("\n--- 3) 常规问答不受影响 ---");
  const a4 = await ask("怎么联系你们？");
  console.log("   engine:", a4?.engine, "| 含电话:", a4?.reply?.includes("400-") || a4?.reply?.includes("电话") ? "✅" : "❌");

  console.log("\n--- 4) 清理 ---");
  for (const id of uploaded) {
    const r = await api(`/api/kb?id=${id}`, { method: "DELETE" });
    console.log("删除", id.slice(0, 8), r.s);
  }

  const pass = ok1 && ok2 && ok3;
  console.log("\n总体:", pass ? "✅ 全部通过" : "⚠️ 存在未命中项，见上");
})();
