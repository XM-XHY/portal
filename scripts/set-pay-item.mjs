/**
 * 直接设置某个付费条目的开关与金额（写入 Supabase 的 paycfg 记录）。
 * 用途：新增工具（如均衡分班）时，快速把它的付费配置对齐到与既有工具一致，
 * 免去人工在后台点一遍（后台「产品付费」同样可以改，二者等价）。
 *
 * ⚠️ 密钥通过 argv 传入，不要内联。
 *
 * 用法：
 *   node scripts/set-pay-item.mjs "<SUPABASE_SERVICE_ROLE_KEY>" balance 30       # 开启并按 30 元收费
 *   node scripts/set-pay-item.mjs "<KEY>" balance 0                              # 关闭付费（免费）
 *   node scripts/set-pay-item.mjs "<KEY>" --list                                 # 只看当前配置
 */
const [key, itemId, amountRaw] = process.argv.slice(2);
const SUPABASE_URL = process.env.SUPABASE_URL || "https://umtqzvgqblleyjxohfwb.supabase.co";

async function fetchPaycfg() {
  const url = `${SUPABASE_URL}/rest/v1/contents?select=*&id=eq.paycfg-main&type=eq.paycfg`;
  const res = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`读取失败 ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const rows = await res.json();
  return rows[0] || null;
}

(async () => {
  if (!key) {
    console.error("用法：node scripts/set-pay-item.mjs <service_role_key> <itemId> <金额元>");
    process.exit(1);
  }
  const row = await fetchPaycfg();
  if (!row) {
    console.error("未找到 paycfg-main 记录，请先在后台「产品付费」保存一次");
    process.exit(1);
  }
  const cfg = JSON.parse(row.body || "{}");
  cfg.items = cfg.items || {};

  if (itemId === "--list" || !itemId) {
    console.log("当前付费配置：", JSON.stringify(cfg.items, null, 2));
    console.log("二维码：", cfg.qrImageUrl ? "已上传" : "未上传");
    return;
  }

  const amount = Number(amountRaw || 0);
  cfg.items[itemId] = { paid: amount > 0, amount: amount > 0 ? amount : 0 };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/contents?id=eq.paycfg-main&type=eq.paycfg`, {
    method: "PATCH",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ body: JSON.stringify(cfg) }),
  });
  if (!res.ok) throw new Error(`写入失败 ${res.status}: ${(await res.text()).slice(0, 300)}`);
  console.log("✓ 已更新：", JSON.stringify(cfg.items, null, 2));
})().catch((e) => {
  console.error("失败：", e.message);
  process.exit(1);
});
