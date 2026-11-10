/**
 * 内存版「作品云端数据库客户端」替身，模拟 Supabase 风格的可链式查询构造器，
 * 仅覆盖 lib/work-db.ts 中 grantEntitlement / paidUntilMs 用到的调用链：
 *   .from(t).select('*').eq(c,v).maybeSingle()
 *   .from(t).select('*').eq(c,v).order(c,{ascending})
 *   .from(t).insert(row)
 *   .from(t).update(obj).eq(c,v)
 *   .from(t).delete().eq(c,v).eq(c,v)
 * 通过 loadTs 的 mock 映射注入 @/lib/data（getWorkClient），从而在无真实
 * PostgreSQL 的情况下验证 SEC-04「同账号绑定 / 防越权领取」的数据层不变量。
 */
const tables = {
  work_entitlements: [],
  work_users: [],
  work_mistakes: [],
  work_flywheel: [],
};

function makeBuilder(table) {
  const b = { _table: table, _filters: [], _order: null, _update: null, _delete: false };

  b.select = () => b;
  b.order = (col, opts) => {
    b._order = { col, asc: !(opts && opts.ascending === false) };
    return b._exec(false);
  };
  b.maybeSingle = () => b._exec(true);

  b.eq = (col, val) => {
    b._filters.push([col, val]);
    // update / delete 之后的 eq 是终结调用
    if (b._update || b._delete) return b._exec(false);
    return b;
  };

  b.insert = (row) => {
    (tables[table] = tables[table] || []).push(row);
    return Promise.resolve({ data: row, error: null });
  };

  b._exec = (single) => {
    let rows = (tables[table] || []).slice();
    for (const [c, v] of b._filters) rows = rows.filter((r) => r[c] === v);
    if (b._order) {
      rows.sort((a, z) =>
        b._order.asc
          ? a[b._order.col] > z[b._order.col]
            ? 1
            : -1
          : a[b._order.col] < z[b._order.col]
            ? 1
            : -1
      );
    }
    if (b._update) {
      for (const r of rows) Object.assign(r, b._update);
      return Promise.resolve({ data: rows, error: null });
    }
    if (b._delete) {
      tables[table] = (tables[table] || []).filter(
        (r) => !b._filters.every(([c, v]) => r[c] === v)
      );
      return Promise.resolve({ data: null, error: null });
    }
    return Promise.resolve({ data: single ? rows[0] || null : rows, error: null });
  };

  return b;
}

export function getWorkClient() {
  return { from: (t) => makeBuilder(t) };
}

/** 测试辅助：读取内存表，用于断言 SEC-04 不变量 */
export function _tables() {
  return tables;
}
/** 测试辅助：清空内存表 */
export function resetWorkTables() {
  for (const k of Object.keys(tables)) tables[k] = [];
}
