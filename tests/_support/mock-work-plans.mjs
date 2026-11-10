/**
 * lib/work-plans.ts 替身：grantEntitlement 只用到 WORK_TRIAL_DAYS（且不在发放路径上），
 * 用常量即可，避免拖入作品套餐/计划逻辑。
 */
export const WORK_TRIAL_DAYS = 7;
