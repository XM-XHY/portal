/**
 * lib/work-session 替身：真实实现依赖 next/headers 的 cookies()，纯 Node 下不可用。
 * 这里把 getWorkUserId 改为读取一个「测试可设置」的当前用户，从而精确模拟
 * 「A 账号购买、B 账号领取」这类跨账号场景（P5 负例）。
 */
let currentUser = null;

/** 设置当前作品用户 id（模拟已登录会话） */
export function setWorkUser(uid) {
  currentUser = uid;
}

/** 清空当前用户（模拟未登录） */
export function clearWorkUser() {
  currentUser = null;
}

export async function getWorkUserId() {
  return currentUser;
}

// 以下为兼容导出（真实模块也导出，避免「模块未导出该成员」运行时错误）
export function signWorkSession() {
  return "";
}
export function verifyWorkSession() {
  return currentUser;
}
