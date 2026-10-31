/** 端到端验证 /api/chat：规则引擎各意图 + 兜底 + 限流。 */
const BASE = process.env.BASE || "http://localhost:3000";

const cases = [
  "你好",
  "你们能做什么？",
  "智能客服是什么？",
  "产品怎么收费？",
  "有哪些客户案例？",
  "怎么联系你们？",
  "支持私有化部署吗？",
  "量子纠缠原理是什么", // 兜底
];

for (const q of cases) {
  try {
    const r = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: q }] }),
    });
    const j = await r.json();
    console.log(`Q: ${q}  → HTTP ${r.status} (engine=${j.engine ?? "-"})`);
    if (j.reply) console.log("A: " + j.reply.split("\n").slice(0, 3).join(" / "));
    else console.log("   " + JSON.stringify(j).slice(0, 120));
  } catch (e) {
    console.log(`Q: ${q} → 异常 ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 5200)); // 绕过 5s 限流
}

// 连发两次测限流
const r1 = await fetch(`${BASE}/api/chat`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ messages: [{ role: "user", content: "你好" }] }),
});
const r2 = await fetch(`${BASE}/api/chat`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ messages: [{ role: "user", content: "你好" }] }),
});
console.log(`\n限流测试: 第一次 ${r1.status}, 紧接着第二次 ${r2.status}（应为 429）`);
