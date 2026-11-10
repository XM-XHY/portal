/**
 * 均衡分班引擎 v2（浏览器本地运行，名单不上传）
 *
 * 用户可自主设置均衡条件项：
 *   - 成绩（蛇形分层）
 *   - 男女比例
 *   - 村居（同一村的学生：可选「打散到不同班」或「尽量同班」）
 *   - 双胞胎捆绑（同组学生：可选「捆绑同班」或「强制分开」）
 *   - 指定班级（硬约束，模板列指定）
 *
 * 算法分三步：
 *   1) 落位：
 *      - 「村居尽量同班」模式：先按村切块（超容量的大村按成绩交叉均匀拆块），
 *        大块优先逐块贪心选择目标函数增量最小的班——从构造上保证同村集中；
 *      - 其他模式：按交换单元（捆绑组/单人）蛇形（S 型）分配，均分降序发牌。
 *      指定班级的学生（组）最先硬锁定。
 *   2) 个体间交换优化：随机挑两个不同班的可交换单元互换，目标函数下降才接受。
 *      交换不改变各班人数，人数极差 ≤ 1 的性质得以保持；
 *      together 模式下拆散村块会大幅抬高目标函数，因此集中性不会被交换破坏。
 *   3) 输出统计与告警。同一种子结果可复现。
 */

export type Gender = "" | "男" | "女";

export type Student = {
  id: string;
  name: string;
  gender: Gender;
  /** 总分；null 表示未提供成绩 */
  score: number | null;
  /** 村居 / 原班级 / 生源校，用于打散或集中 */
  village: string;
  /** 双胞胎 / 捆绑组标识：同组学生按 twinMode 处理；空串表示无分组 */
  group: string;
  /** 指定班级（1 起）；null 表示不指定 */
  fixedClass: number | null;
  note: string;
};

/** 村居处理策略 */
export type VillageMode = "off" | "spread" | "together";
/** 双胞胎处理策略 */
export type TwinMode = "off" | "bind" | "split";

export type BalanceRules = {
  /** 班级数 */
  classCount: number;
  /** 成绩均衡（有成绩时生效） */
  balanceScore: boolean;
  /** 男女比例均衡 */
  balanceGender: boolean;
  /** 村居策略：不启用 / 打散 / 同村尽量同班 */
  villageMode: VillageMode;
  /** 双胞胎策略：不启用 / 捆绑同班 / 强制分开 */
  twinMode: TwinMode;
  /** 随机种子：同一份数据同一种子结果可复现 */
  seed: number;
};

export type ClassStat = {
  index: number;
  name: string;
  count: number;
  male: number;
  female: number;
  unknownGender: number;
  avg: number | null;
  max: number | null;
  min: number | null;
  std: number | null;
  /** 各村居人数，用于检查打散 / 集中效果 */
  villages: Record<string, number>;
};

export type BalanceResult = {
  /** classes[i] = 第 i+1 班的学生数组 */
  classes: Student[][];
  stats: ClassStat[];
  summary: string;
  warnings: string[];
  /** 目标函数值，越小越均衡（调试/展示用） */
  score: number;
};

export const BALANCE_TMPL = {
  name: "学生名册",
  headers: ["姓名", "性别", "总分", "村居", "双胞胎组", "指定班级", "备注"],
  example: ["李小明", "男", "612", "张村", "大宝", "", ""],
  note:
    "性别填 男/女；总分可留空（留空时按性别与村居均衡）；村居填村/社区/原班级；" +
    "双胞胎组填相同编号（如两人都填 大宝）即成为一组，处理方式在「分班设置」中选择；指定班级填数字可锁定该生所在班",
};

export function balanceTemplateCsv(): string {
  return `\ufeff${BALANCE_TMPL.headers.join(",")}\n${BALANCE_TMPL.example.join(",")}\n`;
}

export function defaultRules(classCount = 4): BalanceRules {
  return {
    classCount,
    balanceScore: true,
    balanceGender: true,
    villageMode: "spread",
    twinMode: "bind",
    seed: 20260101,
  };
}

/* ==================== 文件解析（.xlsx / .xls / .csv） ==================== */

async function readRows(buf: ArrayBuffer): Promise<string[][]> {
  // 表格解析统一走 lib/sheet（exceljs），替换存在 high 漏洞且无补丁的 xlsx@0.18.5
  const { readRows: parseSheetRows } = await import("./sheet");
  return parseSheetRows(buf);
}

function s(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function findCol(headers: string[], candidates: string[]): number {
  for (const c of candidates) {
    const i = headers.findIndex((h) => s(h).includes(c));
    if (i >= 0) return i;
  }
  return -1;
}

function toScore(v: string): number | null {
  const t = s(v);
  if (!t) return null;
  const n = Number(t.replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function toGender(v: string): Gender {
  const t = s(v);
  if (t.includes("男") || /^m/i.test(t)) return "男";
  if (t.includes("女") || /^f/i.test(t)) return "女";
  return "";
}

/** 解析学生名册；第一行为表头，列名支持模糊匹配 */
export async function parseBalanceImport(buf: ArrayBuffer): Promise<Student[]> {
  const rows = await readRows(buf);
  if (rows.length < 2) throw new Error("文件内容为空或只有表头，请先填写学生数据");

  const headers = rows[0].map((h) => s(h));
  const iName = findCol(headers, ["姓名", "学生", "名字"]);
  if (iName < 0) throw new Error("未找到「姓名」列，请确认使用的是本页模板");
  const iGender = findCol(headers, ["性别", "男女"]);
  const iScore = findCol(headers, ["总分", "成绩", "分数", "得分"]);
  const iVillage = findCol(headers, ["村居", "村", "社区", "原班级", "生源", "来源", "毕业", "小学"]);
  const iGroup = findCol(headers, ["双胞胎", "捆绑", "同班组", "分组"]);
  const iFixed = findCol(headers, ["指定班级", "固定班级", "锁定班级"]);
  const iNote = findCol(headers, ["备注", "说明"]);

  const out: Student[] = [];
  const seen = new Set<string>();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const name = s(row[iName]);
    if (!name) continue;
    const fixed = iFixed >= 0 ? Number(s(row[iFixed]).replace(/[^\d]/g, "")) : NaN;
    let id = name;
    if (seen.has(id)) id = `${name}#${r}`;
    seen.add(id);
    out.push({
      id,
      name,
      gender: iGender >= 0 ? toGender(row[iGender]) : "",
      score: iScore >= 0 ? toScore(row[iScore]) : null,
      village: iVillage >= 0 ? s(row[iVillage]) : "",
      group: iGroup >= 0 ? s(row[iGroup]) : "",
      fixedClass: Number.isFinite(fixed) && fixed > 0 ? fixed : null,
      note: iNote >= 0 ? s(row[iNote]) : "",
    });
  }
  if (!out.length) throw new Error("未解析到任何学生，请检查文件内容");
  return out;
}

/* ==================== 分班核心 ==================== */

/** 可复现的伪随机 */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stdDev(xs: number[]): number | null {
  if (xs.length < 2) return xs.length === 1 ? 0 : null;
  const m = mean(xs)!;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}

/** 每班容量：总人数不能被整除时，前若干个班多 1 人，保证人数极差 ≤ 1 */
export function capacityOf(total: number, classCount: number, idx: number): number {
  const base = Math.floor(total / classCount);
  return base + (idx < total % classCount ? 1 : 0);
}

function buildStats(classes: Student[][], names: string[]): ClassStat[] {
  const allScores = classes.flat().map((x) => x.score).filter((x): x is number => x != null);
  const allAvg = mean(allScores);
  return classes.map((list, i) => {
    const scores = list.map((x) => x.score).filter((x): x is number => x != null);
    const villages: Record<string, number> = {};
    for (const st of list) if (st.village) villages[st.village] = (villages[st.village] || 0) + 1;
    return {
      index: i,
      name: names[i] || `${i + 1}班`,
      count: list.length,
      male: list.filter((x) => x.gender === "男").length,
      female: list.filter((x) => x.gender === "女").length,
      unknownGender: list.filter((x) => x.gender === "").length,
      avg: allAvg == null ? null : mean(scores),
      max: scores.length ? Math.max(...scores) : null,
      min: scores.length ? Math.min(...scores) : null,
      std: stdDev(scores),
      villages,
    };
  });
}

/**
 * 目标函数（越小越均衡）。在「学生已展开」的班级数组上计算。
 * 交换不改变各班人数，因此只衡量性别、成绩、村居、拆分惩罚。
 */
function objective(classes: Student[][], rules: BalanceRules): number {
  const all = classes.flat();
  const n = all.length || 1;
  let f = 0;

  if (rules.balanceGender) {
    const male = all.filter((x) => x.gender === "男").length;
    const target = male / n; // 全年级男生占比
    for (const c of classes) {
      if (!c.length) continue;
      const r = c.filter((x) => x.gender === "男").length / c.length;
      f += Math.abs(r - target) * 100;
    }
  }

  if (rules.balanceScore) {
    const allAvg = mean(all.map((x) => x.score).filter((x): x is number => x != null));
    if (allAvg != null) {
      for (const c of classes) {
        const avg = mean(c.map((x) => x.score).filter((x): x is number => x != null));
        if (avg == null) continue;
        f += Math.abs(avg - allAvg) / 10; // 均分偏差，除以 10 与性别项量级对齐
      }
    }
  }

  if (rules.villageMode === "spread") {
    // 同一村在某班越集中，平方和越大；目标是让它尽量分散
    for (const c of classes) {
      const map: Record<string, number> = {};
      for (const st of c) if (st.village) map[st.village] = (map[st.village] || 0) + 1;
      for (const k in map) f += map[k] * map[k] * 0.5;
    }
  } else if (rules.villageMode === "together") {
    // 每个村跨的班越少越好：(跨班数-1)² 惩罚
    const byVillage: Record<string, Set<number>> = {};
    classes.forEach((c, ci) => {
      for (const st of c) {
        if (!st.village) continue;
        (byVillage[st.village] ||= new Set()).add(ci);
      }
    });
    for (const k in byVillage) {
      const d = byVillage[k].size - 1;
      if (d > 0) f += d * d * 3;
    }
  }

  if (rules.twinMode === "split") {
    // 同组学生在同班：每对惩罚
    const byGroup: Record<string, Record<number, number>> = {};
    classes.forEach((c, ci) => {
      for (const st of c) {
        if (!st.group) continue;
        const m = (byGroup[st.group] ||= {});
        m[ci] = (m[ci] || 0) + 1;
      }
    });
    for (const g in byGroup) {
      for (const ci in byGroup[g]) {
        const m = byGroup[g][ci];
        if (m > 1) f += ((m * (m - 1)) / 2) * 40;
      }
    }
  }

  return f;
}

function classNames(rules: BalanceRules): string[] {
  return Array.from({ length: rules.classCount }, (_, i) => `${i + 1}班`);
}

/** 手动调班后重算统计（人数/性别/成绩/村居） */
export function rebuildStats(classes: Student[][], rules: BalanceRules): ClassStat[] {
  return buildStats(classes, classNames(rules));
}

/* ---------- 落位 / 交换单元 ---------- */

/** 交换单元：双胞胎捆绑组（bind 模式）或单个学生 */
type Unit = {
  students: Student[];
  /** 单元平均总分，null 表示无成绩 */
  avgScore: number | null;
  /** 是否含指定班级学生（整组锁定，不参与交换） */
  locked: boolean;
  fixedClass: number | null;
};

function mkUnit(list: Student[]): Unit {
  const scores = list.map((x) => x.score).filter((x): x is number => x != null);
  const fixed = list.find((x) => x.fixedClass != null);
  return {
    students: list,
    avgScore: scores.length ? mean(scores) : null,
    locked: !!fixed,
    fixedClass: fixed ? fixed.fixedClass : null,
  };
}

/** 交换单元：bind 模式下同组学生合为一个单元，其余为单人 */
function buildSwapUnits(students: Student[], rules: BalanceRules): Unit[] {
  if (rules.twinMode !== "bind") return students.map((st) => mkUnit([st]));
  const byGroup = new Map<string, Student[]>();
  const out: Unit[] = [];
  for (const st of students) {
    if (st.group) {
      if (!byGroup.has(st.group)) byGroup.set(st.group, []);
      byGroup.get(st.group)!.push(st);
    } else {
      out.push(mkUnit([st]));
    }
  }
  for (const [, list] of byGroup) out.push(mkUnit(list));
  return out;
}

/**
 * 「村居尽量同班」模式的落位块：一个村一块（块不超过单班最大容量，
 * 超出时按成绩交叉均匀拆成多块），块内学生保证进同一个班。
 */
type Chunk = {
  students: Student[];
  avgScore: number | null;
  locked: boolean;
  fixedClass: number | null;
};

function mkChunk(list: Student[]): Chunk {
  const u = mkUnit(list);
  return { students: u.students, avgScore: u.avgScore, locked: u.locked, fixedClass: u.fixedClass };
}

function buildVillageChunks(students: Student[], rules: BalanceRules, maxCap: number): Chunk[] {
  const chunks: Chunk[] = [];
  // 指定班级的学生单独成块（硬约束优先于同村集中）
  for (const st of students) {
    if (st.fixedClass != null) {
      chunks.push({ students: [st], avgScore: st.score, locked: true, fixedClass: st.fixedClass });
    }
  }
  const free = students.filter((st) => st.fixedClass == null);
  const byVillage = new Map<string, Student[]>();
  const noVillage: Student[] = [];
  for (const st of free) {
    if (!st.village) noVillage.push(st);
    else {
      if (!byVillage.has(st.village)) byVillage.set(st.village, []);
      byVillage.get(st.village)!.push(st);
    }
  }
  // 大村优先拆块落位，占位更稳
  const villages = [...byVillage.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [, list] of villages) {
    const k = Math.ceil(list.length / maxCap);
    if (k <= 1) {
      chunks.push(mkChunk(list));
    } else {
      // 按成绩降序轮转发牌，拆成 k 个分数接近的块
      const sorted = [...list].sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
      const parts: Student[][] = Array.from({ length: k }, () => []);
      sorted.forEach((st, i) => parts[i % k].push(st));
      for (const p of parts) chunks.push(mkChunk(p));
    }
  }
  for (const st of noVillage) chunks.push(mkChunk([st]));
  return chunks;
}

/**
 * 主入口：生成均衡分班结果。
 * 数据不足 / 班级数非法 / 捆绑组大于班级数时抛出可直接展示的错误。
 */
export function divideClasses(students: Student[], rules: BalanceRules): BalanceResult {
  const warnings: string[] = [];
  const N = Math.max(1, Math.floor(rules.classCount || 1));
  const total = students.length;
  if (!total) throw new Error("请先导入学生名单");
  if (N > total) throw new Error(`班级数（${N}）不能多于学生数（${total}）`);
  if (rules.twinMode === "bind") {
    const sizes = new Map<string, number>();
    for (const st of students) if (st.group) sizes.set(st.group, (sizes.get(st.group) || 0) + 1);
    for (const [g, m] of sizes) {
      if (m > N) throw new Error(`捆绑组「${g}」有 ${m} 人，超过班级数（${N}），无法同班；请调整分组或班级数`);
    }
  }

  const names = classNames(rules);
  const classes: Student[][] = Array.from({ length: N }, () => []);
  const caps = Array.from({ length: N }, (_, i) => capacityOf(total, N, i));

  // 1) 落位
  const together = rules.villageMode === "together";
  const placeItems: (Unit | Chunk)[] = together
    ? buildVillageChunks(students, rules, caps[0])
    : buildSwapUnits(students, rules);

  // 1a) 指定班级的先硬锁定
  const rest: (Unit | Chunk)[] = [];
  for (const u of placeItems) {
    if (u.locked && u.fixedClass && u.fixedClass >= 1 && u.fixedClass <= N) {
      const idx = u.fixedClass - 1;
      if (classes[idx].length + u.students.length > caps[idx]) {
        warnings.push(`${u.students.map((x) => x.name).join("、")} 指定 ${u.fixedClass}班，但该班容量已满，仍按指定放入`);
      }
      classes[idx].push(...u.students);
    } else {
      if (u.locked && u.fixedClass && (u.fixedClass < 1 || u.fixedClass > N)) {
        warnings.push(`${u.students[0].name} 指定的班级 ${u.fixedClass} 超出范围（1-${N}），已忽略`);
      }
      rest.push(u);
    }
  }

  if (together) {
    // 1b-together) 村块贪心落位：大块优先，逐块试每个班取「目标函数」最小者
    const items = [...rest].sort(
      (a, b) => b.students.length - a.students.length || (b.avgScore ?? 0) - (a.avgScore ?? 0)
    );
    let guard = 0;
    while (items.length) {
      const u = items.shift()!;
      let bestIdx = -1;
      let bestVal = Infinity;
      for (let ci = 0; ci < N; ci++) {
        if (classes[ci].length + u.students.length > caps[ci]) continue;
        classes[ci].push(...u.students);
        const v = objective(classes, rules);
        if (v < bestVal) {
          bestVal = v;
          bestIdx = ci;
        }
        classes[ci].length -= u.students.length;
      }
      if (bestIdx < 0) {
        // 装不下：拆成两半重新排队（理论上极少发生）
        if (u.students.length > 1 && guard++ < 200) {
          const half = Math.ceil(u.students.length / 2);
          items.unshift(mkChunk(u.students.slice(0, half)), mkChunk(u.students.slice(half)));
          continue;
        }
        let minIdx = 0;
        for (let k = 1; k < N; k++) if (classes[k].length < classes[minIdx].length) minIdx = k;
        classes[minIdx].push(...u.students);
        warnings.push(`${u.students.map((x) => x.name).join("、")} 未找到可容纳的班级，已按人数最少原则分配`);
        continue;
      }
      classes[bestIdx].push(...u.students);
    }
  } else {
    // 1b) 蛇形分配：按单元均分降序，偶数轮正序、奇数轮倒序，跳过装不下的班
    const hasScore = rest.some((u) => u.avgScore != null);
    const sorted = [...rest].sort((a, b) => {
      if (hasScore) {
        const as = a.avgScore ?? -Infinity;
        const bs = b.avgScore ?? -Infinity;
        if (bs !== as) return bs - as;
      }
      const av = a.students[0].village || "";
      const bv = b.students[0].village || "";
      if (av !== bv) return av.localeCompare(bv, "zh");
      return a.students[0].name.localeCompare(b.students[0].name, "zh");
    });
    let round = 0;
    let i = 0;
    while (i < sorted.length) {
      const u = sorted[i];
      const order =
        round % 2 === 0
          ? Array.from({ length: N }, (_, k) => k)
          : Array.from({ length: N }, (_, k) => N - 1 - k);
      let placed = false;
      for (const idx of order) {
        if (classes[idx].length + u.students.length <= caps[idx]) {
          classes[idx].push(...u.students);
          i++;
          placed = true;
          break;
        }
      }
      if (!placed) {
        // 容量被锁定单元占满：放进当前最少的班
        let minIdx = 0;
        for (let k = 1; k < N; k++) if (classes[k].length < classes[minIdx].length) minIdx = k;
        classes[minIdx].push(...u.students);
        warnings.push(`部分班级因「指定班级」占用名额，${u.students.map((x) => x.name).join("、")} 已按人数最少原则分配`);
        i++;
      }
      round++;
    }
  }

  // 2) 个体间交换优化：只动未锁定且不同班的单元（捆绑组整组换），目标函数下降才接受。
  //    together 模式下拆散村块会大幅抬高目标函数，集中性不会被交换破坏。
  const swapUnits = buildSwapUnits(students, rules).filter((u) => !u.locked);
  const locOf = new Map<Unit, number>();
  for (const u of swapUnits) {
    for (let ci = 0; ci < N; ci++) {
      if (u.students.every((st) => classes[ci].includes(st))) {
        locOf.set(u, ci);
        break;
      }
    }
  }
  const free = swapUnits.filter((u) => locOf.has(u));

  /** together 模式：取出若干村的「跨班分布」签名，用于禁止交换改变村块完整性 */
  const setsFor = (villages: Set<string>): Map<string, string> => {
    const m = new Map<string, string>();
    if (!villages.size) return m;
    for (const v of villages) m.set(v, "");
    classes.forEach((c, ci) => {
      for (const st of c) {
        if (st.village && m.has(st.village)) m.set(st.village, (m.get(st.village) || "") + ci + ",");
      }
    });
    return m;
  };

  const rand = mulberry32(rules.seed);
  const maxIter = Math.min(20000, Math.max(2000, total * 60));
  let best = objective(classes, rules);
  for (let iter = 0; iter < maxIter && free.length > 1; iter++) {
    const ua = free[Math.floor(rand() * free.length)];
    const ub = free[Math.floor(rand() * free.length)];
    if (!ua || !ub || ua === ub) continue;
    const ca = locOf.get(ua)!;
    const cb = locOf.get(ub)!;
    if (ca === cb) continue;
    const sizeA = ua.students.length;
    const sizeB = ub.students.length;
    if (classes[cb].length - sizeB + sizeA > caps[cb]) continue;
    if (classes[ca].length - sizeA + sizeB > caps[ca]) continue;
    // together 模式：先记录受影响村的跨班签名
    const movedVillages = new Set<string>();
    if (together) {
      for (const st of ua.students) if (st.village) movedVillages.add(st.village);
      for (const st of ub.students) if (st.village) movedVillages.add(st.village);
    }
    const sigBefore = together ? setsFor(movedVillages) : null;
    const take = (ci: number, us: Unit) => classes[ci].filter((st) => !us.students.includes(st));
    classes[ca] = take(ca, ua);
    classes[cb] = take(cb, ub);
    classes[ca].push(...ub.students);
    classes[cb].push(...ua.students);
    locOf.set(ua, cb);
    locOf.set(ub, ca);
    // together 模式：村块跨班分布被改变 → 直接回退（保证同村集中不被交换破坏）
    if (together) {
      const sigAfter = setsFor(movedVillages);
      let changed = false;
      for (const [v, sig] of sigBefore!) {
        if (sigAfter.get(v) !== sig) {
          changed = true;
          break;
        }
      }
      if (changed) {
        classes[ca] = take(ca, ub);
        classes[cb] = take(cb, ua);
        classes[ca].push(...ua.students);
        classes[cb].push(...ub.students);
        locOf.set(ua, ca);
        locOf.set(ub, cb);
        continue;
      }
    }
    const next = objective(classes, rules);
    if (next < best - 1e-9) {
      best = next;
    } else {
      // 换回去
      classes[ca] = take(ca, ub);
      classes[cb] = take(cb, ua);
      classes[ca].push(...ua.students);
      classes[cb].push(...ub.students);
      locOf.set(ua, ca);
      locOf.set(ub, cb);
    }
  }

  const stats = buildStats(classes, names);
  const avgs = stats.map((x) => x.avg).filter((x): x is number => x != null);
  const counts = stats.map((x) => x.count);
  const diff = avgs.length ? Math.max(...avgs) - Math.min(...avgs) : null;
  const twinGroups = new Set(students.map((x) => x.group).filter(Boolean)).size;
  const summary =
    `共 ${total} 人分入 ${N} 个班，每班 ${Math.min(...counts)}~${Math.max(...counts)} 人` +
    (diff != null ? `，各班平均分极差 ${diff.toFixed(1)} 分` : "") +
    `，男生 ${stats.reduce((a, b) => a + b.male, 0)} / 女生 ${stats.reduce((a, b) => a + b.female, 0)}` +
    (twinGroups ? `，捆绑组 ${twinGroups} 组` : "");

  return { classes, stats, summary, warnings, score: best };
}

/* ==================== 导出 ==================== */

/**
 * 生成分班结果工作簿：统计表 + 每班一张名册表（打印友好）。
 * 返回 XLSX.WorkBook，由调用方决定写出方式（前端下载 / 服务端响应）。
 */
export async function buildBalanceWorkbook(
  result: BalanceResult,
  rules: BalanceRules
): Promise<ArrayBuffer> {
  void rules;
  const sheetLib = await import("./sheet");
  const sheets: import("./sheet").SheetSpec[] = [];

  // 统计表
  const head = ["班级", "人数", "男", "女", "未填性别", "平均分", "最高分", "最低分", "标准差", "村居分布"];
  const rows: (string | number)[][] = [head];
  for (const st of result.stats) {
    const top = Object.entries(st.villages)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => `${k}×${v}`)
      .join("、");
    rows.push([
      st.name,
      st.count,
      st.male,
      st.female,
      st.unknownGender,
      st.avg == null ? "" : Number(st.avg.toFixed(1)),
      st.max ?? "",
      st.min ?? "",
      st.std == null ? "" : Number(st.std.toFixed(1)),
      top,
    ]);
  }
  sheets.push({
    name: "分班统计",
    rows,
    colWidths: [10, 8, 6, 6, 10, 10, 10, 10, 10, 28],
  });

  // 每班名册
  result.classes.forEach((list, i) => {
    const r: (string | number)[][] = [[result.stats[i].name, "", "", "", "", ""]];
    r.push(["序号", "姓名", "性别", "总分", "村居", "备注"]);
    [...list]
      .sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity) || a.name.localeCompare(b.name, "zh"))
      .forEach((st, k) => {
        r.push([k + 1, st.name, st.gender, st.score ?? "", st.village, st.note]);
      });
    sheets.push({
      name: `${result.stats[i].name}`,
      rows: r,
      colWidths: [6, 14, 6, 10, 14, 20],
    });
  });

  return sheetLib.buildWorkbookBuffer(sheets);
}
