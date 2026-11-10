/**
 * 全科提分导师（作品中心）会员套餐。
 *
 * 价格以「元」为单位，与后台「产品付费」paycfg 的口径一致；
 * paycfg 里若配置了 work_m / work_q / work_y，会覆盖这里的默认价，
 * 这样运营可以在后台直接调价而不必改代码、重新部署。
 */
export type WorkPlan = {
  id: "m" | "q" | "y";
  name: string;
  days: number;
  defaultAmount: number;
  /** paycfg.items 的键 */
  payKey: string;
};

export const WORK_PLANS: WorkPlan[] = [
  { id: "m", name: "月卡会员", days: 30, defaultAmount: 29, payKey: "work_m" },
  { id: "q", name: "季卡会员", days: 90, defaultAmount: 79, payKey: "work_q" },
  { id: "y", name: "年卡会员", days: 365, defaultAmount: 299, payKey: "work_y" },
];

export function getWorkPlan(id: string): WorkPlan | null {
  return WORK_PLANS.find((p) => p.id === id) || null;
}

export const WORK_TRIAL_DAYS = 7;
