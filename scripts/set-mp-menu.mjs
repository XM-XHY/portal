/**
 * 设置微信公众号自定义菜单（把分班查询入口挂到公众号底部菜单）。
 *
 * ⚠️ 密钥通过 argv 传入，不要内联（沙箱会改写内联字符串）。
 * ⚠️ 需要先把运行本机的出口 IP 加到公众号后台「IP 白名单」，否则微信返回 40164
 *    （报错信息里会带上本机出口 IP，照抄填进去即可）。
 *
 * 用法：
 *   node scripts/set-mp-menu.mjs "<AppID>" "<AppSecret>"           # 设置默认菜单
 *   node scripts/set-mp-menu.mjs "<AppID>" "<AppSecret>" --delete  # 删除菜单
 *   node scripts/set-mp-menu.mjs "<AppID>" "<AppSecret>" --get     # 只看当前菜单
 */
const [appId, appSecret, mode] = process.argv.slice(2);
const SITE = (process.env.SITE_URL || process.env.PAY_NOTIFY_BASE || process.env.NEXT_PUBLIC_SITE_URL || "https://www.cnxhy.top").replace(/\/+$/, "");

async function getToken() {
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(
    appId
  )}&secret=${encodeURIComponent(appSecret)}`;
  const r = await fetch(url, { cache: "no-store" });
  const d = await r.json();
  if (d.errcode) {
    throw new Error(`获取 access_token 失败 ${d.errcode}: ${d.errmsg}`);
  }
  return d.access_token;
}

/** 默认菜单：分班查询 + 官网 + 联系 */
function menu() {
  return {
    button: [
      { type: "view", name: "分班查询", url: `${SITE}/balance/query` },
      {
        name: "教务工具",
        sub_button: [
          { type: "view", name: "均衡分班", url: `${SITE}/balance` },
          { type: "view", name: "智能排课", url: `${SITE}/schedule` },
          // CLICK 事件：由 /api/wechat/mp 按 EventKey 被动回复，用于验证安全模式与菜单事件链路
          { type: "click", name: "使用帮助", key: "HELP" },
          { type: "click", name: "查班级", key: "QUERY" },
          { type: "click", name: "解绑查询码", key: "UNBIND" },
        ],
      },
      { type: "view", name: "官网", url: SITE },
    ],
  };
}

(async () => {
  if (!appId || !appSecret) {
    console.error("用法：node scripts/set-mp-menu.mjs <AppID> <AppSecret> [--delete|--get]");
    process.exit(1);
  }
  const token = await getToken();
  console.log("access_token 获取成功");

  if (mode === "--get") {
    const r = await fetch(`https://api.weixin.qq.com/cgi-bin/get_current_selfmenu_info?access_token=${token}`, {
      cache: "no-store",
    });
    console.log(JSON.stringify(await r.json(), null, 1).slice(0, 1500));
    return;
  }

  const api =
    mode === "--delete"
      ? `https://api.weixin.qq.com/cgi-bin/menu/delete?access_token=${token}`
      : `https://api.weixin.qq.com/cgi-bin/menu/create?access_token=${token}`;
  const r = await fetch(api, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: mode === "--delete" ? undefined : JSON.stringify(menu()),
  });
  const d = await r.json();
  console.log(mode === "--delete" ? "删除菜单：" : "设置菜单：", JSON.stringify(d));
  if (d.errcode === 0) {
    console.log("✅ 成功。菜单生效提示：微信有缓存，取关重关注或等待几分钟即可看到。");
  } else if (d.errcode) {
    console.error("失败：", d.errcode, d.errmsg);
    if (d.errcode === 40164) console.error("→ 需要把上面报错里的 IP 加到公众号后台「IP 白名单」");
    process.exit(1);
  }
})().catch((e) => {
  console.error("错误：", e.message);
  process.exit(1);
});
