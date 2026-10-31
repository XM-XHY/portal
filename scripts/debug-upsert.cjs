/** 复现 saveContents 批量 upsert，找出被吞掉的错误 */
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const env = fs.readFileSync(".env.local", "utf8");
const key = (env.match(/SUPABASE_SERVICE_ROLE_KEY=(\S+)/) || [])[1];
const url = (env.match(/SUPABASE_URL=(\S+)/) || [])[1];

const sb = createClient(url, key, {
  auth: { persistSession: false },
  global: { fetch: (i, init) => fetch(i, { ...init, cache: "no-store" }) },
});

(async () => {
  const { data, error } = await sb.from("contents").select("*");
  if (error) { console.log("select 失败:", error); process.exit(1); }
  console.log("现有行:", data.length, "types:", [...new Set(data.map((d) => d.type))].join(","));

  const kbRow = {
    id: "k_test2", type: "kb", title: "批量测试", tag: "txt", summary: "s",
    body: "b", icon: "📄", tags: [], client: "", industry: "", result: "1",
    at: "2026-10-31", order: Date.now(),
  };
  const rows = [...data, kbRow];

  const r1 = await sb.from("contents").upsert(rows, { onConflict: "id" });
  console.log("批量 upsert:", r1.error ? "❌ " + JSON.stringify(r1.error).slice(0, 400) : "✅ 成功");

  const r2 = await sb.from("contents").upsert([kbRow], { onConflict: "id" });
  console.log("单行 upsert:", r2.error ? "❌ " + JSON.stringify(r2.error).slice(0, 400) : "✅ 成功");
})();
