/* ============================================================
 * 账号与订阅页逻辑：注册 / 登录 / 状态 / 扫码支付 / 自动续费 / 订单
 * 与 index.html 业务脚本完全隔离，只依赖 sub/config.js 与云函数 HTTP 接口
 * ============================================================ */
(function () {
  'use strict';
  var C = window.ENT_CONFIG || { apiBase: '/api/ent', storageKey: 'twb_ent_session', priceText: '20 元 / 月' };
  var KEY = C.storageKey || 'twb_ent_session';
  var $ = function (id) { return document.getElementById(id); };
  var S = { token: '', data: null, tab: 'login', orderNo: '', poll: null, contractCode: '' };

  function tk() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function setTk(v) { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch (e) { } }
  function msg(text, type) {
    var m = $('msg'); if (!m) return;
    m.className = 'ent-msg show ' + (type || 'info');
    m.innerHTML = text;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function fmt(v) {
    if (!v) return '—';
    var t = typeof v === 'number' ? v : Date.parse(v);
    if (isNaN(t) || t <= 0) return '—';
    return new Date(t).toLocaleString('zh-CN', { hour12: false });
  }
  function yuan(f) { return '¥' + (Number(f || 0) / 100).toFixed(2); }

  async function api(path, opt) {
    var o = opt || {}, h = { 'Content-Type': 'application/json' };
    if (tk()) h.Authorization = 'Bearer ' + tk();
    var res = await fetch(C.apiBase + path, {
      method: o.method || 'GET', headers: h,
      body: o.body ? JSON.stringify(o.body) : undefined
    });
    var j = {}; try { j = await res.json(); } catch (e) { }
    return { status: res.status, data: j };
  }
  function show(id, on) { var e = $(id); if (e) e.classList[on ? 'remove' : 'add']('ent-hidden'); }

  /* ---------------- 注册 / 登录 ---------------- */
  document.querySelectorAll('.ent-tab').forEach(function (tab) {
    tab.onclick = function () {
      document.querySelectorAll('.ent-tab').forEach(function (x) { x.classList.remove('active'); });
      tab.classList.add('active');
      S.tab = tab.dataset.tab;
      $('authSubmit').textContent = S.tab === 'login' ? '登录' : '注册并开启 7 天试用';
      show('f_nick_wrap', S.tab === 'register');
    };
  });

  $('authForm').onsubmit = async function (e) {
    e.preventDefault();
    var body = { account: $('f_account').value.trim(), password: $('f_pwd').value };
    if (S.tab === 'register') body.nickname = $('f_nick').value.trim();
    var btn = $('authSubmit'); btn.disabled = true; btn.innerHTML = '<span class="ent-spinner"></span> 处理中';
    try {
      var r = await api('/api/auth/' + (S.tab === 'login' ? 'login' : 'register'), { method: 'POST', body: body });
      if (r.status !== 200 || !r.data.ok) { msg('❌ ' + esc(r.data.message || '操作失败'), 'err'); return; }
      setTk(r.data.data.token); S.token = r.data.data.token;
      msg('✅ ' + (S.tab === 'login' ? '登录成功' : '注册成功，已开启 7 天免费试用'), 'ok');
      await loadSession();
    } catch (err) {
      msg('❌ 无法连接授权服务：' + esc(err.message) + '。请确认 sub/config.js 的 apiBase 已指向部署好的云函数。', 'err');
    } finally { btn.disabled = false; btn.textContent = S.tab === 'login' ? '登录' : '注册并开启 7 天试用'; }
  };

  /* ---------------- 会话与状态展示 ---------------- */
  async function loadSession() {
    if (!tk()) { show('authPanel', true); show('userPanel', false); return; }
    try {
      var r = await api('/api/auth/session');
      if (r.status === 401) { setTk(''); show('authPanel', true); show('userPanel', false); return; }
      if (r.status !== 200 || !r.data.ok) { msg('❌ ' + esc(r.data.message || '状态获取失败'), 'err'); return; }
      S.data = r.data.data;
      show('authPanel', false); show('userPanel', true);
      render(S.data);
      await loadOrders();
    } catch (e) {
      msg('❌ 无法连接授权服务：' + esc(e.message), 'err');
    }
  }

  function render(d) {
    var u = d.user, e = d.entitlement;
    var tag = $('statusTag'); tag.className = 'ent-tag ' + e.status; tag.textContent = e.statusText;
    var ar = u.autoRenew || {};
    var renewText = ar.signed ? '已开通自动续费' : (ar.status === 'pending' ? '待用户签约' :
      (ar.status === 'cancelled' ? '已关闭' : (ar.status === 'failed' ? '扣款失败已停止' : '未开通')));
    var payMap = { none: '未支付', pending: '待支付', paid: '已付费', failed: '支付失败', refunded: '已退款' };
    var rows = [
      ['账号', esc(u.account)], ['注册时间', fmt(u.createdAt)],
      ['试用到期时间', fmt(e.trialUntilText)], ['付费有效期至', fmt(e.paidUntilText)],
      ['后台授予期限', fmt(e.grantUntilText)], ['综合使用期限', fmt(e.validUntilText)],
      ['付费状态', payMap[u.payStatus] || u.payStatus], ['续费状态', renewText],
      ['权限状态', e.enabled ? '启用' : '停用' + (u.permission && u.permission.disabledReason ? '（' + esc(u.permission.disabledReason) + '）' : '')],
      ['已购月数', (u.totalPaidMonths || 0) + ' 个月'],
      ['企业网站账号', u.siteLink && u.siteLink.siteAccount ? esc(u.siteLink.siteAccount) +
        '（' + esc(u.siteLink.status || 'none') + '）' : '—'],
      ['当前状态', e.statusText + (e.canUse ? ' · 可正常使用' : ' · 访问受限')]
    ];
    $('kvGrid').innerHTML = rows.map(function (r) {
      return '<div class="ent-kv"><div class="k">' + r[0] + '</div><div class="v">' + r[1] + '</div></div>';
    }).join('');
    $('btnBack').disabled = !e.canUse;
    $('btnBack').textContent = e.canUse ? '返回工作台' : '权限未开通，无法进入工作台';

    var signed = !!(ar.signed);
    var papayOn = !!d.papayEnabled;   /* 未开通委托代扣时隐藏签约入口，避免用户点击触发 409（A1 健壮性） */
    show('btnEntrust', !signed && ar.status !== 'pending' && papayOn);
    show('btnCancelRenew', signed);
    show('btnMockSign', !signed && ar.status === 'pending' && d.payMode === 'mock');
    $('renewDesc').innerHTML = signed
      ? '已开通：' + (d.priceFen ? yuan(d.priceFen) + '/月' : '20 元/月') + '，将在到期前自动扣款顺延。可随时关闭，关闭后不再扣款。'
      : (d.papayEnabled ? '开通后系统将在到期前按 20 元/月自动扣款并顺延使用期限；需先在微信中完成签约授权。'
        : '商户尚未开通微信「委托代扣」产品权限，暂不能自动扣款；可在到期前手动扫码续费，功能配置完成后此处将自动开放。');
  }

  /* ---------------- 扫码支付 ---------------- */
  $('btnPay').onclick = async function () {
    var b = this; b.disabled = true; b.innerHTML = '<span class="ent-spinner"></span> 正在下单';
    try {
      var r = await api('/api/pay/order', { method: 'POST', body: { plan: 'month' } });
      if (r.status !== 200 || !r.data.ok) { msg('❌ ' + esc(r.data.message || '下单失败'), 'err'); return; }
      var d = r.data.data;
      S.orderNo = d.outTradeNo;
      show('qrBox', true);
      if (d.qrDataUrl) { $('qrImg').src = d.qrDataUrl; show('qrImg', true); $('qrFallback').textContent = ''; }
      else {
        show('qrImg', false);
        $('qrFallback').textContent = '二维码组件未安装（云函数目录执行 npm install）。可复制下方链接在微信中打开：\n' + d.codeUrl;
      }
      $('qrInfo').innerHTML = '订单号 <b>' + esc(d.outTradeNo) + '</b> · 金额 <b>' + yuan(d.amountFen) + '</b> · 有效期至 ' + fmt(d.expiresAt) +
        (d.reused ? ' · 沿用未过期订单' : '');
      $('payHint').textContent = d.mock || (S.data && S.data.payMode === 'mock') ? '沙箱模式' : '微信支付';
      show('payHint', true);
      show('btnMockPay', d.mock || (S.data && S.data.payMode === 'mock'));
      msg('请使用微信扫一扫完成支付，支付成功后本页会自动刷新权限状态。', 'info');
      startPoll();
    } catch (e) { msg('❌ 下单失败：' + esc(e.message), 'err'); }
    finally { b.disabled = false; b.textContent = '重新生成付款二维码'; }
  };

  function startPoll() {
    if (S.poll) clearInterval(S.poll);
    var n = 0;
    S.poll = setInterval(async function () {
      n++;
      if (n > 100 || !S.orderNo) { clearInterval(S.poll); S.poll = null; return; }
      try {
        var r = await api('/api/pay/order?no=' + encodeURIComponent(S.orderNo));
        if (r.status === 200 && r.data.ok && r.data.data.status === 'paid') {
          clearInterval(S.poll); S.poll = null;
          show('qrBox', false); show('btnMockPay', false);
          msg('✅ 支付成功，已自动按月开通 / 延续使用权限。', 'ok');
          await loadSession();
        }
      } catch (e) { /* 轮询失败不影响用户手动点刷新 */ }
    }, 3000);
  }

  $('btnMockPay').onclick = async function () {
    if (!S.orderNo) return;
    var r = await api('/api/pay/mock-confirm', { method: 'POST', body: { outTradeNo: S.orderNo } });
    if (r.data && r.data.ok) { msg('✅ 模拟支付成功，正在刷新权限…', 'ok'); await loadSession(); }
    else msg('❌ ' + esc(r.data && r.data.message || '模拟支付失败'), 'err');
  };
  $('btnCheckPay').onclick = async function () {
    if (S.orderNo) {
      var r = await api('/api/pay/order?no=' + encodeURIComponent(S.orderNo));
      if (r.data && r.data.ok && r.data.data.status === 'paid') { await loadSession(); msg('✅ 已确认支付，权限已更新。', 'ok'); }
      else msg('暂未查询到支付结果，请稍后重试或联系管理员。', 'info');
    } else await loadSession();
  };
  $('btnCopy').onclick = function () {
    var t = $('qrFallback').textContent || '';
    var m = /(weixin:\/\/[^\s]+)/.exec(t);
    var v = m ? m[1] : t;
    if (navigator.clipboard) navigator.clipboard.writeText(v).then(function () { msg('已复制支付链接', 'ok'); });
    else msg('请手动复制支付链接：' + esc(v), 'info');
  };

  /* ---------------- 自动续费 ---------------- */
  $('btnEntrust').onclick = async function () {
    var r = await api('/api/contract/entrust', { method: 'POST', body: { returnUrl: location.href } });
    if (r.status !== 200 || !r.data.ok) { msg('❌ ' + esc(r.data.message || '签约申请失败'), 'err'); return; }
    var d = r.data.data;
    S.contractCode = d.outContractCode;
    if (d.url) { msg('请在微信中完成签约授权：<a href="' + esc(d.url) + '" target="_blank" rel="noopener">打开签约页</a>', 'info'); }
    else if (d.mock) msg('沙箱模式：点击下方「模拟确认签约」完成用户授权演示。', 'info');
    else msg('签约参数已生成，请按商户接入文档在微信内拉起签约：' + esc(JSON.stringify(d.payload)).slice(0, 200), 'info');
    await loadSession();
  };
  $('btnMockSign').onclick = async function () {
    var r = await api('/api/contract/mock-confirm', { method: 'POST', body: { outContractCode: S.contractCode } });
    if (r.data && r.data.ok && r.data.data.signed) { msg('✅ 已模拟完成签约，自动续费已开通。', 'ok'); await loadSession(); }
    else msg('❌ ' + esc(r.data && r.data.message || '签约失败'), 'err');
  };
  $('btnCancelRenew').onclick = async function () {
    if (!confirm('确定关闭自动续费？关闭后不会再自动扣款，已开通的期限继续有效。')) return;
    var r = await api('/api/contract/cancel', { method: 'POST', body: { reason: '用户主动关闭' } });
    if (r.data && r.data.ok) { msg('✅ 已关闭自动续费。', 'ok'); await loadSession(); }
    else msg('❌ ' + esc(r.data && r.data.message || '关闭失败'), 'err');
  };

  /* ---------------- 订单 / 其它 ---------------- */
  async function loadOrders() {
    var r = await api('/api/pay/orders');
    if (r.status !== 200 || !r.data.ok) return;
    var map = { pending: '待支付', paid: '已支付', failed: '失败', closed: '已关闭', refunded: '已退款' };
    $('orderRows').innerHTML = r.data.data.list.map(function (o) {
      return '<tr><td>' + esc(o.outTradeNo) + '</td><td>' + (o.kind === 'auto' ? '自动续费' : '手动支付') +
        '</td><td>' + yuan(o.amountFen) + '</td><td>' + (map[o.status] || o.status) + '</td><td>' +
        fmt(o.createdAt) + '</td><td>' + fmt(o.paidAt) + '</td></tr>';
    }).join('') || '<tr><td colspan="6" style="text-align:center;color:#94a3b8">暂无订单</td></tr>';
  }

  $('btnRefresh').onclick = loadSession;
  $('btnLogout').onclick = function () {
    setTk(''); S.data = null; show('authPanel', true); show('userPanel', false);
    msg('已退出登录。', 'info');
  };
  $('btnBack').onclick = function () {
    var q = new URLSearchParams(location.search).get('next');
    location.href = q && /^[a-zA-Z0-9_\-.]+\.html$/.test(q) ? q : 'index.html';
  };

  loadSession();
})();
