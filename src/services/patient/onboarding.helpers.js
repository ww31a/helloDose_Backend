import { InjectionLog } from "../../models/injectionLog.model.js";
import { ONBOARDING_INJECTION_NOTE } from "./constants.js";

export const syncOnboardingInjectionLogs = async (
  userId,
  plan,
  injectionsThisMonth,
  lastInjectionDate
) => {
  const count = Math.max(0, Number(injectionsThisMonth) || 0);
  const reportedAt = lastInjectionDate ? new Date(lastInjectionDate) : new Date();

  await InjectionLog.deleteMany({
    patient: userId,
    plan: plan._id,
    notes: ONBOARDING_INJECTION_NOTE,
  });

  if (count === 0) return;

  await InjectionLog.insertMany(
    Array.from({ length: count }, () => ({
      patient: userId,
      plan: plan._id,
      medication: plan.name,
      dosage: plan.currentDosage || "",
      injectedAt: reportedAt,
      notes: ONBOARDING_INJECTION_NOTE,
    }))
  );
};
