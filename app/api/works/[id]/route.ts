import { readFile } from "node:fs/promises";
import path from "node:path";
import { getWork } from "@/lib/works";

/**
 * 作品体验入口：按 id 输出单文件 App 的 HTML。
 *
 * 安全设计（对应 lib/works.ts 里的约定）：
 *   1. id 走白名单，文件路径由记录里的 file 字段决定，**绝不拼接请求参数**，杜绝路径穿越。
 *   2. 禁止缓存：作品是可售卖的成品包，不能让浏览器 / CDN 缓存出公开副本。
 *   3. X-Robots-Tag: noindex，避免被搜索引擎收录成可自由下载的页面。
 *   4. frame-ancestors 'self' + X-Frame-Options，禁止外站把这个体验嵌到自己站里当产品用。
 *
 * 这里不做「未付费就拒绝」：包内已有自己的试用 + 会员门禁（云端账号 + 主站微信支付），
 * 在外层再加一道付费墙会让所有访客都看不到试用，反而与「在线体验」的目标冲突。
 *
 * 移动端补丁在输出时注入，而不是改 assets/works/*.html：
 * 作品包来自「数字员工制作空间」，后续替换成品文件时不会被我们的改动覆盖，
 * 也不会把宿主站点的适配逻辑混进交付给客户的离线包里。
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VIEWPORT_META =
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">';

/** 注入到作品包 </head> 前的移动端适配样式（只影响在线体验版，不写回离线包） */
const MOBILE_CSS = `<style id="host-mobile-patch">
  html { -webkit-text-size-adjust: 100%; }
  *, *::before, *::after { -webkit-tap-highlight-color: transparent; }
  html, body { overscroll-behavior: contain; }
  body { overflow-x: hidden; padding-bottom: env(safe-area-inset-bottom); }
  /* iOS Safari 在输入框字号 < 16px 时会放大整页且不自动缩回 */
  input, select, textarea { font-size: 16px !important; max-width: 100%; }
  .vbar select { max-width: 46vw; }
  /* 包内有 4 张表格且原本没有滚动容器，会横向撑破页面 */
  .card { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  table { font-size: 12px; }
  th, td { padding: 6px 5px; word-break: break-word; }
  /* 触控目标不小于 44px */
  .tabs button, button.act, button.sec, button.ghost,
  .gatecard .act, .gatecard .ghost, .plan { min-height: 44px; }
  .tabs button { padding-top: 10px; padding-bottom: 10px; }
  .gatecard { max-height: calc(100dvh - 32px); }
  #toast { bottom: calc(24px + env(safe-area-inset-bottom)); }
  @media (max-width: 640px) {
    header { padding: max(12px, env(safe-area-inset-top)) 12px 12px; }
    header h1 { font-size: 16px; line-height: 1.45; }
    header p { font-size: 12px; line-height: 1.6; }
    .wrap { padding: 0 12px; }
    .tabs { gap: 8px; }
    .tabs button { flex: 1 1 44%; font-size: 13px; }
    .card { padding: 12px; }
    .vbar { font-size: 13px; line-height: 2.1; }
    .gatecard { padding: 18px 16px; }
    #acctBar { flex-wrap: wrap; justify-content: flex-start; }
    .row { gap: 8px; }
    /* 使用指南整段占掉首屏，窄屏先折叠成 3 行，点按钮再看全文 */
    .guide { padding: 10px 12px; margin-bottom: 10px; }
    .guide h2 { font-size: 14px; margin-bottom: 6px; }
    .guide p { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; font-size: 12px; line-height: 1.6; }
    .guide p.host-expanded { display: block; -webkit-line-clamp: unset; overflow: visible; }
    .host-guide-toggle { display: block; min-height: 36px; margin-top: 8px; padding: 6px 12px; border: 1px solid #93c5fd; border-radius: 8px; background: #fff; color: #1d4ed8; font-size: 13px; cursor: pointer; }
  }
</style>`;

/** 折叠/展开使用指南；纯展示增强，包一层 try/catch 避免影响作品自身逻辑 */
const MOBILE_SCRIPT = `<script id="host-mobile-enhance">
(function(){
  try {
    var g = document.querySelector('.guide p');
    if (!g || !g.parentNode) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'host-guide-toggle';
    btn.textContent = '展开完整指南';
    btn.addEventListener('click', function(){
      var expanded = g.classList.toggle('host-expanded');
      btn.textContent = expanded ? '收起指南' : '展开完整指南';
    });
    g.parentNode.appendChild(btn);
  } catch (e) {}
})();
</script>`;

/** 补齐 viewport-fit 与移动端样式；原包替换后依然自动生效 */
function applyMobilePatch(html: string): string {
  let out = html;
  if (/<meta\s+name=["']viewport["'][^>]*>/i.test(out)) {
    out = out.replace(/<meta\s+name=["']viewport["'][^>]*>/i, VIEWPORT_META);
  } else {
    out = out.replace(/<head([^>]*)>/i, `<head$1>${VIEWPORT_META}`);
  }
  out = out.replace("</head>", `${MOBILE_CSS}\n</head>`);
  if (/<\/body>/i.test(out)) {
    out = out.replace(/<\/body>/i, `${MOBILE_SCRIPT}\n</body>`);
  }
  return out;
}

/** 仅允许站内同源 iframe / 直接打开；外站文档级引用一律拒绝 */
function isAllowedReferrer(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  const dest = req.headers.get("sec-fetch-dest");
  // 外站页面把我们当 document 打开（含被别的站点 iframe 嵌套）
  if (site === "cross-site" && dest === "document") return false;
  if (site === "cross-site" && dest === "iframe") return false;
  return true;
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const work = getWork(params.id);
  if (!work) {
    return new Response("Not Found", { status: 404 });
  }

  if (!isAllowedReferrer(req)) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    // standalone 产物里 assets 由 postbuild-cloudbase.mjs 补齐到运行目录，
    // 本地 dev / start 时 cwd 就是项目根目录，两种情况路径一致。
    const filePath = path.join(process.cwd(), "assets", "works", work.file);
    const html = await readFile(filePath, "utf8");

    return new Response(applyMobilePatch(html), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
        "X-Robots-Tag": "noindex, nofollow",
        "X-Frame-Options": "SAMEORIGIN",
        // 只声明 frame-ancestors，不限制其余资源：包内需要从 CDN 加载 OCR 引擎
        "Content-Security-Policy": "frame-ancestors 'self'",
      },
    });
  } catch (e) {
    console.error("[works] 读取作品文件失败:", (e as Error)?.message);
    return new Response("作品文件暂不可用", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
