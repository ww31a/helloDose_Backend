import { InjectionLog } from "../../models/injectionLog.model.js";
import { DAYS_IN_INJECTION_CYCLE } from "./constants.js";
import { addDays } from "./date.helpers.js";

export const getCycleStartDate = (plan) => {
  if (plan.refillCycleStartedAt) return new Date(plan.refillCycleStartedAt);
  if (plan.nextRefillDate) {
    return addDays(new Date(plan.nextRefillDate), -DAYS_IN_INJECTION_CYCLE);
  }
  return plan.startedAt ? new Date(plan.startedAt) : null;
};

export const countCycleInjectionLogs = async (userId, plan, cycleStart = getCycleStartDate(plan)) => {
  if (!cycleStart) return 0;

  const cycleStartNormalized = new Date(cycleStart);
  cycleStartNormalized.setHours(0, 0, 0, 0);

  return InjectionLog.countDocuments({
    patient: userId,
    plan: plan._id,
    injectedAt: { $gte: cycleStartNormalized },
  });
};
