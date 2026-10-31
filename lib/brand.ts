/**
 * 品牌显示名：企业名已以"科技"结尾时不再重复追加，
 * 避免后台填入"XHY 科技"后页面显示成"XHY 科技科技"。
 */
export function brandName(companyName: string): string {
  const name = (companyName || "").trim();
  if (!name) return name;
  return /科技$/.test(name) ? name : `${name}科技`;
}
