/**
 * 内存版 @/lib/store 替身（仅实现被测逻辑用到的函数）。
 * 通过 loadTs 的 mock 映射注入，使 payconfig / orders / pay-access / session
 * 在不连数据库的前提下跑通。saveContents 语义与真实实现一致：整体替换。
 */
let contents = [];

export async function getContents(type) {
  if (type) return contents.filter((c) => c.type === type);
  return contents.slice();
}

export async function saveContents(items) {
  contents = Array.isArray(items) ? items.slice() : [];
  return contents.slice();
}

export function newId(prefix) {
  return (prefix || "") + Math.random().toString(36).slice(2, 12);
}

export async function getSite() {
  return {};
}
export async function getAdmins() {
  return [];
}

/** 测试辅助：清空内存库 */
export function resetStore() {
  contents = [];
}
/** 测试辅助：直接塞入若干内容条目 */
export function setContents(items) {
  contents = Array.isArray(items) ? items.slice() : [];
}
