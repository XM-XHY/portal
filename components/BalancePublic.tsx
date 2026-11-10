"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  balanceTemplateCsv,
  parseBalanceImport,
  divideClasses,
  rebuildStats,
  buildBalanceWorkbook,
  defaultRules,
  BALANCE_TMPL,
  type Student,
  type BalanceRules,
  type BalanceResult,
  type VillageMode,
  type TwinMode,
} from "@/lib/balance-engine";
import PayGate from "@/components/PayGate";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** 示范数据：含村居与双胞胎，便于用户先看效果再导入自己的名单 */
/** 发给家长的通知文案：三种查询方式一次说清，可直接复制到班级群 */
function parentNotice(code: string, count: number): string {
  return `【分班结果查询通知】
本次共 ${count} 名学生的分班结果已公布，家长可通过以下任一方式查询孩子所在班级：

方式一（最快捷）：在本公众号内直接发送
${code} 学生姓名
例如：${code} 李小明
系统会自动回复孩子所在班级。

方式二：点击公众号底部菜单「分班查询」，输入查询码 ${code} 和学生姓名查询。

方式三：扫描学校张贴的分班查询二维码，在网页中输入学生姓名查询。

提示：查询码为 ${code}，如提示重名或查不到，请联系班主任确认。`;
}

function demoStudents(): Student[] {
  const surnames = "赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张";
  const given = ["子涵", "欣怡", "浩然", "思远", "雨萱", "嘉豪", "梓晴", "宇轩", "诗琪", "俊杰"];
  const villages = ["张村", "李庄", "王屯", "刘家湾", "陈家营"];
  const out: Student[] = [];
  for (let i = 0; i < 96; i++) {
    out.push({
      id: `demo-${i}`,
      name: `${surnames[i % surnames.length]}${given[i % given.length]}`,
      gender: i % 5 === 0 ? "女" : i % 2 === 0 ? "男" : "女",
      score: 380 + ((i * 37) % 320),
      village: villages[i % villages.length],
      group: i < 8 ? `双胞胎${Math.floor(i / 2) + 1}` : "",
      fixedClass: null,
      note: "",
    });
  }
  return out;
}

type PublishInfo = { code: string; url: string; qr: string; count: number };
/** 老师发布过的记录：新版按登录账号从服务端列出，key 仅用于兼容旧记录 */
type MyPub = {
  code: string;
  key: string;
  title: string;
  count: number;
  classes: number;
  at: string;
  disabled: boolean;
  owner?: string;
};

const PUB_STORE_KEY = "balance_pubs_v1";

function loadLocalPubs(): { code: string; key: string }[] {
  try {
    const raw = localStorage.getItem(PUB_STORE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => x && x.code && x.key) : [];
  } catch {
    return [];
  }
}

function saveLocalPubs(list: { code: string; key: string }[]): void {
  try {
    localStorage.setItem(PUB_STORE_KEY, JSON.stringify(list.slice(0, 30)));
  } catch {}
}

export default function BalancePublic() {
  const [students, setStudents] = useState<Student[]>([]);
  const [rules, setRules] = useState<BalanceRules>(() => defaultRules(3));
  const [result, setResult] = useState<BalanceResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [activeClass, setActiveClass] = useState(0);
  const [pubTitle, setPubTitle] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState<PublishInfo | null>(null);
  const [myPubs, setMyPubs] = useState<MyPub[]>([]);
  const [pubErr, setPubErr] = useState("");
  const [copied, setCopied] = useState(false);
  const [me, setMe] = useState<{ username: string; role: string } | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [loginUser, setLoginUser] = useState("");
  const [loginPwd, setLoginPwd] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  /** 读取当前登录的站点账号（老师账号由管理员在后台「用户与角色」开通） */
  const loadMe = useCallback(async () => {
    setMeLoading(true);
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      setMe(res.ok ? await res.json() : null);
    } catch {
      setMe(null);
    } finally {
      setMeLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  async function teacherLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginBusy(true);
    setLoginErr("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUser, password: loginPwd }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "登录失败");
      setMe({ username: d.username, role: d.role });
      setLoginPwd("");
      // me 变化会触发 useEffect 重新拉取该账号名下的发布记录
    } catch (e: any) {
      setLoginErr(e.message || "登录失败");
    } finally {
      setLoginBusy(false);
    }
  }

  async function teacherLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setMe(null);
  }

  const hasScore = useMemo(() => students.some((s) => s.score != null), [students]);
  const hasVillage = useMemo(() => students.some((s) => s.village), [students]);
  const hasGroup = useMemo(() => students.some((s) => s.group), [students]);

  async function importFile(file: File) {
    setBusy(true);
    setErr("");
    try {
      const buf = await file.arrayBuffer();
      const list = await parseBalanceImport(buf);
      setStudents(list);
      setResult(null);
      setActiveClass(0);
      setPublished(null);
    } catch (e: any) {
      setErr(e.message || "导入失败");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function loadDemo() {
    setStudents(demoStudents());
    setResult(null);
    setErr("");
    setActiveClass(0);
    setPublished(null);
  }

  function clearAll() {
    setStudents([]);
    setResult(null);
    setErr("");
    setPublished(null);
  }

  function downloadTemplate() {
    const csv = balanceTemplateCsv();
    downloadBlob(
      new Blob(["\ufeff" + csv.replace(/^\ufeff/, "")], { type: "text/csv;charset=utf-8" }),
      `${BALANCE_TMPL.name}.csv`
    );
  }

  function updateRules(patch: Partial<BalanceRules>) {
    setRules((r) => ({ ...r, ...patch }));
    setPublished(null);
  }

  function generate() {
    setBusy(true);
    setErr("");
    setPublished(null);
    try {
      const res = divideClasses(students, rules);
      setResult(res);
      setActiveClass(0);
    } catch (e: any) {
      setErr(e.message || "分班失败");
    } finally {
      setBusy(false);
    }
  }

  /** 手动调班：把某学生移到目标班，并即时重算统计 */
  function moveStudent(studentId: string, toIdx: number) {
    if (!result) return;
    const classes = result.classes.map((c) => c.slice());
    let from = -1;
    let pos = -1;
    for (let i = 0; i < classes.length; i++) {
      const k = classes[i].findIndex((s) => s.id === studentId);
      if (k >= 0) {
        from = i;
        pos = k;
        break;
      }
    }
    if (from < 0 || from === toIdx) return;
    const [stu] = classes[from].splice(pos, 1);
    classes[toIdx].push(stu);
    setResult({
      ...result,
      classes,
      stats: rebuildStats(classes, rules),
    });
    setPublished(null); // 名单已变，之前发布的查询作废
  }

  async function exportExcel() {
    if (!result) return;
    // lib/balance-engine 直接返回 xlsx 二进制（底层已由 xlsx 换成 exceljs），前端只负责下载
    const buf = await buildBalanceWorkbook(result, rules);
    downloadBlob(
      new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      `均衡分班结果_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  }

  /**
   * 拉取查询码列表：登录后服务端按账号 owner 返回全部发布（跨设备可见）；
   * 同时把本机旧版 manageKey 记录一并带入，兼容历史发布。
   */
  const loadMyPubs = useCallback(async () => {
    try {
      const res = await fetch("/api/balance/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list", items: loadLocalPubs() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "加载失败");
      setMyPubs((d.items || []).map((x: any) => ({ ...x, key: x.key || "" })));
    } catch {
      // 静默失败：历史记录加载失败不影响分班主流程
    }
  }, []);

  useEffect(() => {
    loadMyPubs();
  }, [loadMyPubs, me]);

  /** 对某条发布执行改名 / 停用 / 启用 / 删除 */
  async function pubAction(pub: MyPub, action: "rename" | "disable" | "enable" | "delete") {
    let title: string | undefined;
    if (action === "rename") {
      const input = window.prompt("新的查询标题（家长查询时显示）", pub.title);
      if (input == null) return;
      title = input.trim().slice(0, 60);
      if (!title) {
        setPubErr("标题不能为空");
        return;
      }
    }
    if (action === "delete" && !window.confirm(`确定删除查询码 ${pub.code} 吗？删除后家长将无法再查询，且不可恢复。`)) {
      return;
    }
    setPubErr("");
    try {
      const res = await fetch("/api/balance/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, code: pub.code, key: pub.key, title }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "操作失败");
      if (action === "delete") {
        saveLocalPubs(loadLocalPubs().filter((x) => x.code !== pub.code));
        if (published?.code === pub.code) setPublished(null);
      }
      await loadMyPubs();
    } catch (e: any) {
      setPubErr(e.message || "操作失败");
    }
  }

  /** 重新展示某条历史发布的二维码与链接 */
  async function showPub(pub: MyPub) {
    const QRCode = (await import("qrcode")).default;
    const url = `${window.location.origin}/balance/query?code=${pub.code}`;
    const qr = await QRCode.toDataURL(url, { width: 360, margin: 1 });
    setPublished({ code: pub.code, url, qr, count: pub.count });
    setPubTitle(pub.title);
  }

  /** 发布查询：把分班结果存到服务器，生成家长扫码查询页 */
  async function publishQuery() {
    if (!result) return;
    if (!me) {
      setPubErr("请先在下方「⑤ 我的发布记录」登录老师账号，再发布查询码");
      return;
    }
    setPublishing(true);
    setPubErr("");
    try {
      const entries = result.classes.map((list, i) => ({
        className: result.stats[i].name,
        names: list.map((s) => s.name),
      }));
      const res = await fetch("/api/balance/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: pubTitle.trim() || "新生分班查询",
          entries,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "发布失败");
      const QRCode = (await import("qrcode")).default;
      const qr = await QRCode.toDataURL(data.url, { width: 360, margin: 1 });
      setPublished({ code: data.code, url: data.url, qr, count: students.length });
      // 发布记录已由服务端按 owner 落库，不再依赖本机 localStorage；刷新列表即可看到。
      await loadMyPubs();
    } catch (e: any) {
      setPubErr(e.message || "发布失败");
    } finally {
      setPublishing(false);
    }
  }

  const counts = result?.stats.map((s) => s.count) || [];
  const sizeDiff = counts.length ? Math.max(...counts) - Math.min(...counts) : 0;
  const avgs = result?.stats.map((s) => s.avg).filter((x): x is number => x != null) || [];
  const avgDiff = avgs.length ? Math.max(...avgs) - Math.min(...avgs) : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">
            均衡 <span className="text-gradient">分班系统</span>
          </h1>
          <p className="mt-3 max-w-2xl text-slate-400">
            导入学生名册，按成绩、男女、村居（同村可选同班或打散）、双胞胎捆绑等条件一键均衡分班，
            支持指定班级锁定与手动微调。分班免费使用，导出名单需支付少量费用；分班后可发布家长扫码查询。
          </p>
        </div>
        <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-sm text-emerald-300">
          免费使用 · 下载付费
        </span>
      </div>

      <div className="mt-8 space-y-6">
        {/* ① 导入 */}
        <div className="glass p-6">
          <h3 className="text-lg font-semibold text-white">① 导入学生名单</h3>
          <p className="mt-1 text-xs text-slate-400">{BALANCE_TMPL.note}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button onClick={downloadTemplate} className="btn-ghost py-2 text-sm">
              ⬇ 下载模板（CSV）
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importFile(f);
              }}
              className="block w-full max-w-sm cursor-pointer rounded-lg border border-white/15 bg-slate-900/80 px-2 py-1.5 text-xs text-slate-300 file:mr-2 file:cursor-pointer file:rounded file:border-0 file:bg-brand-blue/80 file:px-2 file:py-1 file:text-white"
            />
            <button onClick={loadDemo} className="text-sm text-brand-cyan hover:underline">
              没有数据？加载 96 人示例（含村居与双胞胎）
            </button>
            {students.length > 0 && (
              <button onClick={clearAll} className="text-sm text-slate-400 hover:underline">
                清空
              </button>
            )}
          </div>
          {students.length > 0 && (
            <p className="mt-3 text-sm text-emerald-300">
              已导入 {students.length} 名学生
              {hasScore ? "（含成绩）" : "（无成绩，将按性别与村居均衡）"}
              {hasVillage ? " · 含村居" : ""}
              {hasGroup ? " · 含捆绑组" : ""}
            </p>
          )}
        </div>

        {/* ② 条件设置 */}
        <div className="glass p-6">
          <h3 className="text-lg font-semibold text-white">② 分班条件（按需勾选）</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block text-sm text-slate-400">
              班级数量
              <select
                value={rules.classCount}
                onChange={(e) => updateRules({ classCount: Number(e.target.value) })}
                className="input-base mt-1"
              >
                {Array.from({ length: 19 }, (_, i) => i + 2).map((n) => (
                  <option key={n} value={n}>
                    {n} 个班
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 pt-6 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={rules.balanceScore}
                onChange={(e) => updateRules({ balanceScore: e.target.checked })}
                className="h-4 w-4 accent-brand-violet"
              />
              成绩均衡（蛇形分层）
            </label>
            <label className="flex items-center gap-2 pt-6 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={rules.balanceGender}
                onChange={(e) => updateRules({ balanceGender: e.target.checked })}
                className="h-4 w-4 accent-brand-violet"
              />
              男女比例均衡
            </label>
            <label className="block text-sm text-slate-400">
              村居（{hasVillage ? "检测到村居数据" : "名单中未填村居列则无效果"}）
              <select
                value={rules.villageMode}
                onChange={(e) => updateRules({ villageMode: e.target.value as VillageMode })}
                className="input-base mt-1"
              >
                <option value="off">不启用</option>
                <option value="spread">打散：同村学生分到不同班</option>
                <option value="together">同班：同一村尽量分在一个班</option>
              </select>
            </label>
            <label className="block text-sm text-slate-400">
              双胞胎捆绑（{hasGroup ? "检测到捆绑组" : "名单中未填双胞胎组列则无效果"}）
              <select
                value={rules.twinMode}
                onChange={(e) => updateRules({ twinMode: e.target.value as TwinMode })}
                className="input-base mt-1"
              >
                <option value="off">不启用</option>
                <option value="bind">捆绑：同组学生分在同一个班</option>
                <option value="split">拆分：同组学生强制分开</option>
              </select>
            </label>
            <div className="pt-6 text-xs text-slate-500">
              「指定班级」列填了数字的学生始终锁定在对应班（最高优先级）。
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
            <span>随机种子 {rules.seed}</span>
            <button
              onClick={() => updateRules({ seed: Math.floor(Math.random() * 1e8) })}
              className="text-brand-cyan hover:underline"
            >
              换一种分配方案
            </button>
          </div>
        </div>

        {/* ③ 生成 + 结果 */}
        <div className="glass p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-white">③ 一键分班</h3>
              <p className="mt-1 text-xs text-slate-400">按上述条件自动分班，人数极差不超过 1 人。</p>
            </div>
            <button
              onClick={generate}
              disabled={busy || students.length === 0}
              className="btn-primary disabled:opacity-50"
            >
              {busy ? "分班中…" : "⚖️ 一键均衡分班"}
            </button>
          </div>

          {!result ? (
            <p className="mt-4 text-sm text-slate-500">
              {students.length === 0
                ? "请先导入学生名单（或加载示例数据）。"
                : "点击「一键均衡分班」生成结果。"}
            </p>
          ) : (
            <div className="mt-5 space-y-5">
              {/* 总览 */}
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span
                  className={`rounded-full px-3 py-1 ${
                    sizeDiff <= 1 ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"
                  }`}
                >
                  人数极差 {sizeDiff} 人
                </span>
                {avgDiff != null && (
                  <span className="rounded-full bg-brand-cyan/20 px-3 py-1 text-brand-cyan">
                    平均分极差 {avgDiff.toFixed(1)} 分
                  </span>
                )}
                <span className="text-slate-400">{result.summary}</span>
              </div>

              {result.warnings.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-300">
                  {result.warnings.slice(0, 5).map((w, i) => (
                    <div key={i}>· {w}</div>
                  ))}
                </div>
              )}

              {/* 各班统计卡 */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {result.stats.map((s) => (
                  <div key={s.index} className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">{s.name}</span>
                      <span className="text-xs text-slate-400">{s.count} 人</span>
                    </div>
                    <div className="mt-2 text-xs text-slate-300">
                      男 {s.male} · 女 {s.female}
                      {s.unknownGender ? ` · 未填 ${s.unknownGender}` : ""}
                    </div>
                    <div className="mt-2 text-xs text-slate-400">
                      {s.avg == null ? "无成绩数据" : `均分 ${s.avg.toFixed(1)} · 标准差 ${(s.std ?? 0).toFixed(1)}`}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {s.max != null ? `最高 ${s.max} / 最低 ${s.min}` : ""}
                    </div>
                    {Object.keys(s.villages).length > 0 && (
                      <div className="mt-1 truncate text-xs text-slate-500">
                        村居：{Object.entries(s.villages).map(([k, v]) => `${k}×${v}`).join("、")}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* 名单 + 手动调班 */}
              <div>
                <div className="flex flex-wrap gap-2">
                  {result.stats.map((s) => (
                    <button
                      key={s.index}
                      onClick={() => setActiveClass(s.index)}
                      className={`rounded-lg px-4 py-2 text-sm ${
                        activeClass === s.index
                          ? "bg-gradient-to-r from-brand-blue to-brand-violet text-white"
                          : "border border-white/15 text-slate-300 hover:bg-white/10"
                      }`}
                    >
                      {s.name}（{s.count}）
                    </button>
                  ))}
                  <span className="ml-auto flex gap-2">
                    <PayGate
                      productId="balance"
                      label="⬇ Excel"
                      className="btn-ghost py-2 text-sm"
                      onGranted={exportExcel}
                    />
                    <PayGate
                      productId="balance"
                      label="🖨️ PDF/打印"
                      className="btn-ghost py-2 text-sm"
                      onGranted={() => window.print()}
                    />
                  </span>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate-400">
                        <th className="py-2 pr-3">#</th>
                        <th className="py-2 pr-3">姓名</th>
                        <th className="py-2 pr-3">性别</th>
                        <th className="py-2 pr-3">总分</th>
                        <th className="py-2 pr-3">村居</th>
                        <th className="py-2 pr-3">调整到</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(result.classes[activeClass] || []).map((st, i) => (
                        <tr key={st.id} className="border-t border-white/5">
                          <td className="py-1.5 pr-3 text-xs text-slate-500">{i + 1}</td>
                          <td className="py-1.5 pr-3 text-white">
                            {st.name}
                            {st.group && (
                              <span className="ml-1 rounded bg-brand-violet/20 px-1.5 py-0.5 text-[10px] text-brand-violet">
                                {st.group}
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 pr-3 text-slate-300">{st.gender || "-"}</td>
                          <td className="py-1.5 pr-3 text-slate-300">{st.score ?? "-"}</td>
                          <td className="py-1.5 pr-3 text-slate-400">{st.village || "-"}</td>
                          <td className="py-1.5 pr-3">
                            <select
                              value={activeClass}
                              onChange={(e) => moveStudent(st.id, Number(e.target.value))}
                              className="rounded border border-white/15 bg-slate-900/80 px-2 py-1 text-xs text-slate-200"
                            >
                              {result.stats.map((s) => (
                                <option key={s.index} value={s.index}>
                                  {s.name}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                      {!(result.classes[activeClass] || []).length && (
                        <tr>
                          <td colSpan={6} className="py-4 text-center text-xs text-slate-500">
                            该班暂无学生
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ④ 发布家长扫码查询 */}
              <div className="rounded-xl border border-brand-cyan/25 bg-brand-cyan/5 p-5">
                <h4 className="font-semibold text-white">④ 发布家长扫码查询（免费）</h4>
                <p className="mt-1 text-xs text-slate-400">
                  发布后生成一个查询码与二维码。家长有三种查询方式：① 手机扫码后在网页输入姓名；
                  ② 点公众号菜单「分班查询」输入查询码与姓名；③ <b className="text-brand-cyan">在公众号里直接发送「查询码 + 学生姓名」</b>（如：MXL38Z 李小明）即可自动回复班级。
                  再次调整名单后需重新发布。
                </p>
                {!published ? (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <input
                      value={pubTitle}
                      onChange={(e) => setPubTitle(e.target.value)}
                      placeholder="查询标题，如：实验中学2026级新生分班"
                      className="w-full max-w-xs rounded-lg border border-white/15 bg-slate-900/80 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600"
                    />
                    <button
                      onClick={publishQuery}
                      disabled={publishing || !me}
                      title={me ? undefined : "请先登录老师账号"}
                      className="btn-ghost py-2 text-sm disabled:opacity-50"
                    >
                      {publishing ? "发布中…" : "📤 生成查询二维码"}
                    </button>
                    {!me && !meLoading && (
                      <span className="text-xs text-amber-300">需先在下方「⑤ 我的发布记录」登录老师账号</span>
                    )}
                    {pubErr && <span className="text-sm text-red-400">{pubErr}</span>}
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap items-start gap-6">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={published.qr}
                      alt="家长查询二维码"
                      className="h-40 w-40 rounded-lg bg-white p-2"
                    />
                    <div className="space-y-2 text-sm">
                      <p className="text-slate-300">
                        查询码：<span className="font-mono text-lg font-bold text-brand-cyan">{published.code}</span>
                      </p>
                      <p className="text-xs text-slate-400">
                        家长入口：扫码或访问
                        <a href={published.url} target="_blank" rel="noreferrer" className="ml-1 text-brand-cyan hover:underline">
                          {published.url}
                        </a>
                      </p>
                      <p className="text-xs text-slate-500">
                        已发布 {published.count} 名学生的分班结果。把二维码图片右键另存后打印张贴即可；
                        也请把下面的通知文案发到班级群，家长在公众号里发「{published.code} 姓名」就能查到班级。
                      </p>
                      <div className="rounded-lg border border-white/10 bg-slate-900/70 p-3">
                        <p className="whitespace-pre-line text-xs leading-relaxed text-slate-300">{parentNotice(published.code, published.count)}</p>
                        <button
                          onClick={async () => {
                            const text = parentNotice(published.code, published.count);
                            try {
                              await navigator.clipboard.writeText(text);
                              setCopied(true);
                              setTimeout(() => setCopied(false), 2000);
                            } catch {
                              setPubErr("复制失败，请手动选中上方文案复制");
                            }
                          }}
                          className="btn-ghost mt-2 py-1.5 text-xs"
                        >
                          {copied ? "✓ 已复制" : "📋 复制家长通知"}
                        </button>
                      </div>
                      <button
                        onClick={() => {
                          downloadBlob(
                            // 将 dataURL 转为 blob 下载
                            (() => {
                              const bin = atob(published.qr.split(",")[1]);
                              const buf = new Uint8Array(bin.length);
                              for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
                              return new Blob([buf], { type: "image/png" });
                            })(),
                            `分班查询二维码_${published.code}.png`
                          );
                        }}
                        className="btn-ghost py-1.5 text-xs"
                      >
                        ⬇ 下载二维码图片
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        {/* ⑤ 我的发布记录（历史查询码管理） */}
        <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-semibold text-white">⑤ 我的发布记录</h4>
            <button onClick={loadMyPubs} className="btn-ghost py-1.5 text-xs">刷新</button>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            登录老师账号后，这里会列出<b className="text-slate-200">该账号发布的全部查询码</b>（换电脑、清缓存都不会丢），
            可查看二维码、改标题、临时停用或删除。没有账号？教师可
            <a href="/register" target="_blank" rel="noreferrer" className="text-brand-cyan hover:underline">自助注册</a>。
          </p>

          {meLoading ? (
            <p className="mt-3 text-xs text-slate-500">正在检查登录状态…</p>
          ) : me ? (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-emerald-400/25 bg-emerald-500/5 px-3 py-2">
              <span className="text-xs text-emerald-300">✅ 已登录老师账号：{me.username}</span>
              <button onClick={teacherLogout} className="text-xs text-slate-400 hover:text-white">退出登录</button>
            </div>
          ) : (
            <>
              <form onSubmit={teacherLogin} className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                placeholder="老师账号"
                autoComplete="username"
                className="w-40 rounded-lg border border-white/15 bg-slate-900/80 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600"
              />
              <input
                type="password"
                value={loginPwd}
                onChange={(e) => setLoginPwd(e.target.value)}
                placeholder="密码"
                autoComplete="current-password"
                className="w-40 rounded-lg border border-white/15 bg-slate-900/80 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600"
              />
              <button type="submit" disabled={loginBusy} className="btn-ghost py-2 text-sm disabled:opacity-50">
                {loginBusy ? "登录中…" : "登录"}
              </button>
              {loginErr && <span className="text-xs text-red-400">{loginErr}</span>}
            </form>
            <p className="mt-2 text-xs text-slate-500">
              还没有账号？
              <a href="/register" target="_blank" rel="noreferrer" className="text-brand-cyan hover:underline">
                教师自助注册
              </a>
            </p>
            </>
          )}

          {myPubs.length === 0 ? (
            <p className="mt-3 text-xs text-slate-500">
              {me ? "暂无记录 —— 分班后点上面的「生成查询二维码」即可创建。" : "登录后即可看到你发布过的查询码；历史记录仍可通过本机密钥查看。"}
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {myPubs.map((p) => (
                <div
                  key={p.code}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2"
                >
                  <div className="min-w-[12rem] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-brand-cyan">{p.code}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${
                        p.disabled ? "bg-rose-500/20 text-rose-300" : "bg-emerald-500/20 text-emerald-300"
                      }`}>
                        {p.disabled ? "已停用" : "查询中"}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-400">
                      {p.title || "（未命名）"} · {p.classes} 个班 / {p.count} 人
                      {p.at ? ` · ${new Date(p.at).toLocaleString("zh-CN")}` : ""}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => showPub(p)} className="rounded-lg border border-white/15 px-2 py-1 text-xs hover:bg-white/10">
                      查看二维码
                    </button>
                    <button onClick={() => pubAction(p, "rename")} className="rounded-lg border border-white/15 px-2 py-1 text-xs hover:bg-white/10">
                      改标题
                    </button>
                    <button
                      onClick={() => pubAction(p, p.disabled ? "enable" : "disable")}
                      className="rounded-lg border border-amber-400/40 px-2 py-1 text-xs text-amber-300 hover:bg-amber-500/10"
                    >
                      {p.disabled ? "恢复查询" : "停用"}
                    </button>
                    <button
                      onClick={() => pubAction(p, "delete")}
                      className="rounded-lg border border-rose-400/40 px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/10"
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        </div>

        {err && <p className="text-sm text-red-400">{err}</p>}
        <p className="text-xs text-slate-500">
          提示：分班在浏览器本地完成，名单不会上传服务器（发布查询时仅上传「姓名 + 班级」对照，不含成绩等敏感信息）。
          导出 Excel / 打印会弹出收款二维码，支付后即可下载。
        </p>
        <p className="text-xs text-slate-500">
          还需要排课？
          <a href="/schedule" className="ml-1 text-brand-cyan hover:underline">
            前往智能排课系统 →
          </a>
        </p>
      </div>
    </div>
  );
}
