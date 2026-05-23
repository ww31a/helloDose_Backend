import { DAYS_IN_INJECTION_CYCLE } from "./constants.js";
import { addDays, getDayLabel, getDaysUntilDate } from "./date.helpers.js";

/**
 * Resolves the anchor injection used for refill math (logs or onboarding-reported date).
 */
export const resolveLastInjectionForRefill = (plan, latestInjection) => {
  if (latestInjection?.injectedAt) return latestInjection;
  if (plan.lastKnownInjectionDate) {
    return { injectedAt: plan.lastKnownInjectionDate };
  }
  return null;
};

/**
 * Case 1 — last injection known:
 *   next_refill = last_injection + interval_days * remaining_injections
 *   remaining = frequency - completedCount; when 0 → refill on last injection day
 *
 * Case 2 — no last injection yet:
 *   base = onboardingDate + 30 days
 *   complete cycle → base; base in future → base
 *   base passed, cycle incomplete → slide forward daily until final injection logged (Case 1)
 */
export const computeNextRefillDate = (plan, lastInjection, completedCount) => {
  const frequency = Number(plan.frequency);

   if (!plan.lastKnownInjectionDate && plan.refillCycleStartedAt) {
    return addDays(new Date(plan.refillCycleStartedAt), DAYS_IN_INJECTION_CYCLE);
  }
  const lastInjectionRecord = resolveLastInjectionForRefill(plan, lastInjection);

  if (lastInjectionRecord?.injectedAt) {
    const lastDate = new Date(lastInjectionRecord.injectedAt);

    if (!frequency || frequency <= 0) {
      return addDays(lastDate, DAYS_IN_INJECTION_CYCLE);
    }

    const intervalDays = Math.floor(DAYS_IN_INJECTION_CYCLE / frequency);
    const remainingInjections = Math.max(0, frequency - completedCount);

    if (remainingInjections === 0) {
      return lastDate;
    }

    return addDays(lastDate, intervalDays * remainingInjections);
  }

  const baseDate = plan.onboardingDate || plan.startedAt;
  if (!baseDate) return null;

  const thirtyDaysAfterOnboarding = addDays(new Date(baseDate), DAYS_IN_INJECTION_CYCLE);
  const now = new Date();

  if (frequency > 0 && completedCount >= frequency) {
    return thirtyDaysAfterOnboarding;
  }

  if (thirtyDaysAfterOnboarding > now) {
    return thirtyDaysAfterOnboarding;
  }

  return addDays(now, 1);
};

export const getRefillReorderFields = (computedNextRefillDate) => {
  if (!computedNextRefillDate) {
    return {
      daysUntilNextRefill: null,
      reorderStatus: null,
      nextRefillLabel: null,
    };
  }

  const daysUntilNextRefill = getDaysUntilDate(computedNextRefillDate);

  return {
    daysUntilNextRefill,
    reorderStatus:
      daysUntilNextRefill <= 0 ? "eligible_now" : `eligible_in_${daysUntilNextRefill}_days`,
    nextRefillLabel:
      daysUntilNextRefill <= 0 ? "Available now" : `In ${getDayLabel(daysUntilNextRefill)}`,
  };
};
