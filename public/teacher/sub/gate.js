/* ============================================================
 * 在线版应用门禁（fail-closed，无任何离线能力）
 *  - 未取得服务端授权，业务脚本不会启动（不 buildMenu / 不 render）
 *  - 无 token / 权限失效 / 网络不可达 → 一律锁定，不存在本地放行与离线宽限
 *  - 授权通过后从腾讯云拉取该账号的 workspace 数据，再启动应用
 *  - 业务数据保存时防抖推送云端；换设备或重装安装包可恢复
 * ============================================================ */
(function () {
  'use strict';
  var C = window.ENT_CONFIG || {};
  var KEY = C.storageKey || 'twb_ent_session';
  var WKEY = C.workspaceKey || 'universal_teacher_workbench_v1';
  var API = C.apiBase || '/api/ent';
  var ENFORCE = C.enforce !== false;

  window.__ENT_ALLOWED__ = false;          /* 默认锁定 */
  window.__ENT_BOOTED__ = false;
  document.documentElement.classList.add('ent-locked');

  var syncVersion = 0, syncTimer = null, syncBusy = false, syncEnabled = false, lastPushedText = null;

  function token() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function clearToken() { try { localStorage.removeItem(KEY); } catch (e) { } }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function fmt(v) { if (!v) return '—'; var t = Date.parse(v); return isNaN(t) ? '—' : new Date(t).toLocaleString('zh-CN', { hour12: false }); }

  async function api(path, opt) {
    var o = opt || {}, headers = { 'Content-Type': 'application/json' };
    if (token()) headers.Authorization = 'Bearer ' + token();
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 10000) : null;
    try {
      var res = await fetch(API + path, {
        method: o.method || 'GET', headers: headers,
        body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
        signal: ctl ? ctl.signal : undefined,
        cache: 'no-store'
      });
      var j = {}; try { j = await res.json(); } catch (e) { }
      return { status: res.status, data: j };
    } finally { if (timer) clearTimeout(timer); }
  }

  var overlay = null;
  function showGate(title, text, actions, note) {
    document.documentElement.classList.add('ent-locked');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'ent-gate';
      overlay.id = 'entGate';
      document.body.appendChild(overlay);
    }
    var btns = (actions || []).map(function (a, i) {
      return '<button class="ent-btn ' + (a.cls || '') + '" data-act="' + i + '">' + a.label + '</button>';
    }).join('');
    overlay.innerHTML = '<div class="ent-gate-box"><h3>' + title + '</h3><p>' + text + '</p>' +
      '<div class="ent-gate-actions">' + btns + '</div>' +
      (note ? '<div class="ent-gate-note">' + note + '</div>' : '') + '</div>';
    (actions || []).forEach(function (a, i) {
      var el = overlay.querySelector('[data-act="' + i + '"]');
      if (el) el.onclick = a.onClick;
    });
    overlay.classList.remove('ent-hidden');
  }
  function lockNow() {
    window.__ENT_ALLOWED__ = false;
    syncEnabled = false;
    lastPushedText = null;
    window.ENT_SYNC = null;
  }
  function hideGate() {
    if (overlay) overlay.classList.add('ent-hidden');
    document.documentElement.classList.remove('ent-locked');
  }
  function goAccount() {
    var next = encodeURIComponent(location.pathname.split('/').pop() || 'index.html');
    location.href = (C.accountUrl || 'account.html') + '?next=' + next;
  }
  function goSite() { location.href = C.appUrl || (C.siteBase || 'https://www.cnxhy.top') + '/teacher/'; }

  /* ---------------- 云端业务数据 ---------------- */
  async function pullWorkspace() {
    if (!C.syncEnabled) return;
    var r = await api('/api/workspace');
    if (r.status === 200 && r.data && r.data.ok) {
      var d = r.data.data || {};
      syncVersion = Number(d.version || 0);
      if (d.data && typeof window.__ENT_WORKSPACE__ !== 'undefined' && window.__ENT_WORKSPACE__.apply(d.data)) {
        return;                       /* 云端存在数据：已覆盖本机缓存 */
      }
      /* 云端为空：把本机已有数据作为该账号的初始版本上传一次 */
      var snapshot = (typeof window.__ENT_WORKSPACE__ !== 'undefined')
        ? window.__ENT_WORKSPACE__.snapshot() : (function () { try { return localStorage.getItem(WKEY) || ''; } catch (e) { return ''; } })();
      if (snapshot) await pushNow(snapshot);
    }
  }

  async function pushNow(text) {
    if (!syncEnabled || syncBusy || !text) return;
    if (text === lastPushedText) return;   /* G1：内容未变则跳过，省带宽并避免无谓的版本推进 */
    syncBusy = true;
    try {
      var r = await api('/api/workspace', { method: 'PUT', body: { data: text, version: syncVersion } });
      if (r.status === 200 && r.data && r.data.ok) {
        syncVersion = Number(r.data.data.version || syncVersion);
        lastPushedText = text;   /* G1：记录已成功推送内容，供后续跳过重推 */
        if (window.ENT_SYNC) { window.ENT_SYNC.lastSync = Date.now(); window.ENT_SYNC.lastError = null; window.ENT_SYNC.lastErrorMsg = ''; }
      }
      else if (r.status === 409) {
        /* 云端更新：拉取最新数据覆盖本机，避免多设备互相覆盖 */
        var fresh = await api('/api/workspace');
        if (fresh.status === 200 && fresh.data && fresh.data.ok && fresh.data.data.data && typeof window.__ENT_WORKSPACE__ !== 'undefined') {
          window.__ENT_WORKSPACE__.apply(fresh.data.data.data);
          syncVersion = Number(fresh.data.data.version || syncVersion);
          lastPushedText = null;   /* 冲突后本机已被云端覆盖，允许下次保存重新上传 */
          if (window.ENT_SYNC) { window.ENT_SYNC.lastSync = Date.now(); window.ENT_SYNC.lastError = null; }
          showGate('数据已在其它设备更新', '为避免使用期限/备课数据互相覆盖，已同步为云端最新版本。',
            [{ label: '继续使用', onClick: function () { hideGate(); } }], '刷新页面可重新拉取。');
        }
      }
      else {
        /* E1：同步失败对用户可见，避免无感丢数据；下次保存会自动重试 */
        var em = (r.data && (r.data.message || r.data.error)) || ('HTTP ' + r.status);
        if (window.ENT_SYNC) { window.ENT_SYNC.lastError = Date.now(); window.ENT_SYNC.lastErrorMsg = em; }
        toast('云端同步失败：' + em + '（将在下次保存时重试）', 'warn');
      }
    } catch (e) {
      if (window.ENT_SYNC) { window.ENT_SYNC.lastError = Date.now(); window.ENT_SYNC.lastErrorMsg = (e && e.message) || '网络异常'; }
      toast('云端同步失败：' + ((e && e.message) || '网络异常') + '（下次保存自动重试）', 'warn');
    }
    finally { syncBusy = false; }
  }

  function toast(text, type) {
    var t = document.getElementById('entToast');
    if (!t) { t = document.createElement('div'); t.id = 'entToast'; t.className = 'ent-toast'; document.body.appendChild(t); }
    t.textContent = text; t.className = 'ent-toast show ' + (type || 'info');
    clearTimeout(t._tm); t._tm = setTimeout(function () { t.className = 'ent-toast ' + (type || 'info'); }, 4000);
  }

  function schedulePush(text) {
    if (!syncEnabled) return;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(function () { syncTimer = null; pushNow(text); }, C.syncDebounceMs || 1500);
  }

  function addEntry() {
    if (!C.showEntry || document.getElementById('entEntry')) return;
    var b = document.createElement('button');
    b.id = 'entEntry'; b.className = 'ent-entry'; b.textContent = '账号与订阅';
    b.onclick = goAccount;
    document.body.appendChild(b);
  }

  /* ---------------- 心跳：任何失败立即锁定 ---------------- */
  var hb = null;
  function startHeartbeat() {
    if (hb) return;
    hb = setInterval(async function () {
      try {
        var r = await api('/api/auth/verify', { method: 'POST' });
        if (r.status !== 200 || !r.data || !r.data.ok) throw new Error(r.data && r.data.message || '权限校验未通过');
      } catch (e) {
        clearInterval(hb); hb = null;
        lockNow();
        showGate('连接已中断，工作台已锁定',
          '在线版需要持续联网校验使用权限。' + esc(e && e.message || '授权服务不可达') +
          '<br>请检查网络后重试；本机不保存任何可离线使用的授权。',
          [{ label: '重新连接', onClick: function () { location.reload(); } },
           { label: '前往订阅页', cls: 'ghost', onClick: goAccount }],
          '数据已保存在腾讯云，联网后会自动恢复。');
      }
    }, C.heartbeatMs || 300000);
  }

  function needLogin(msg) {
    lockNow();
    showGate('登录教师工作台', msg || ('新用户注册即享 <b>' + (C.trialDays || 7) + ' 天免费试用</b>，' +
      '试用到期后通过微信扫码支付 <b>' + (C.priceText || '20 元 / 月') + '</b> 继续使用。'),
      [{ label: '注册 / 登录', onClick: goAccount },
       { label: '打开在线版', cls: 'ghost', onClick: goSite }],
      '账号、付费、续费与使用权限均由腾讯云数据库保存并校验；本应用需联网使用，不提供离线模式。');
  }
  function needPay(e) {
    lockNow();
    var label = e && e.statusText || '权限未开通';
    showGate('使用权限' + label, '当前状态：<b>' + esc(label) + '</b>。' +
      (e && e.validUntilText ? '最近使用期限：' + esc(fmt(e.validUntilText)) + '。<br>' : '') +
      '请微信扫码支付 <b>' + (C.priceText || '20 元 / 月') + '</b> 开通或延续使用权限。',
      [{ label: '前往订阅', onClick: goAccount },
       { label: '刷新状态', cls: 'ghost', onClick: function () { location.reload(); } }],
      '权限停用、手动开通与期限设定一律由企业网站后台管理员处理。');
  }
  function networkDown(reason) {
    lockNow();
    showGate('无法连接授权服务', esc(reason || '网络请求失败') +
      '<br>在线版必须在联网状态下由服务端校验权限，<b>不提供离线使用</b>。',
      [{ label: '重试', onClick: function () { location.reload(); } },
       { label: '打开企业网站在线版', cls: 'ghost', onClick: goSite }],
      '若刚部署，请确认网站同域代理 /api/ent 与腾讯云云函数 ent 已上线。');
  }

  async function unlock(d) {
    /* 先拉取云端 workspace，再启动业务脚本，保证界面展示的是该账号的数据 */
    try { await pullWorkspace(); } catch (e) {
      if (window.ENT_SYNC) { window.ENT_SYNC.lastError = Date.now(); window.ENT_SYNC.lastErrorMsg = (e && e.message) || '拉取失败'; }
      toast('云端数据拉取失败，已使用本机缓存：' + ((e && e.message) || '网络异常'), 'warn');
    }
    window.__ENT_ALLOWED__ = true;
    syncEnabled = !!C.syncEnabled;
    window.ENT_SYNC = {
      push: schedulePush, flush: pushNow, version: function () { return syncVersion; },
      lastSync: null, lastError: null, lastErrorMsg: '',
      status: function () { return { version: syncVersion, lastSync: window.ENT_SYNC && window.ENT_SYNC.lastSync, lastError: window.ENT_SYNC && window.ENT_SYNC.lastError, lastErrorMsg: window.ENT_SYNC && window.ENT_SYNC.lastErrorMsg }; }
    };
    hideGate();
    if (typeof window.__ENT_BOOT__ === 'function') window.__ENT_BOOT__();
    addEntry();
    startHeartbeat();
  }

  async function boot() {
    if (!ENFORCE) { networkDown('部署配置错误：enforce 必须为 true（在线版不允许关闭权限校验）'); return; }
    if (!token()) { needLogin(); return; }
    showGate('正在校验使用权限', '正在连接腾讯云授权服务，请稍候…<br><span class="ent-spinner"></span>',
      [], '在线版每次启动都需要联网校验，不提供离线宽限。');
    try {
      var r = await api('/api/auth/session');
      if (r.status === 200 && r.data && r.data.ok) {
        var d = r.data.data, e = d.entitlement;
        if (e && e.canUse) await unlock(d);
        else needPay(e);
      } else if (r.status === 401) { clearToken(); needLogin('登录状态已失效，请重新登录。'); }
      else if (r.status === 403 || r.status === 500) { needPay(null); }
      else networkDown('授权服务返回 ' + r.status + '：' + esc(r.data && r.data.message || '未知错误'));
    } catch (err) { networkDown(err && err.message || '网络请求失败'); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* 暴露给账户页：登录成功后可主动刷新门禁 */
  window.ENT_GATE = {
    api: api, reload: function () { location.reload(); },
    unlock: function (d) { return unlock(d || {}); },
    siteUrl: C.appUrl || ''
  };
})();
