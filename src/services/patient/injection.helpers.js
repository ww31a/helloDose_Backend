import dayjs from "dayjs";
import { DAYS_IN_INJECTION_CYCLE } from "./constants.js";
import { addDays } from "./date.helpers.js";

export const getInjectionIntervalDays = (frequency) => {
  const numericFrequency = Number(frequency);
  if (!numericFrequency || Number.isNaN(numericFrequency) || numericFrequency <= 0) {
    return null;
  }
  return Math.floor(DAYS_IN_INJECTION_CYCLE / numericFrequency);
};

export const resolveLastInjectionAt = (plan, latestInjection) => {
  if (latestInjection?.injectedAt) return latestInjection.injectedAt;
  if (plan.lastKnownInjectionDate) return plan.lastKnownInjectionDate;
  return null;
};

/**
 * Builds next-injection schedule fields and display label from the scheduled due date.
 */
export const buildInjectionInsights = ({ frequency, lastInjectionAt }) => {
  const injectionIntervalDays = getInjectionIntervalDays(frequency);

  if (!lastInjectionAt || !injectionIntervalDays) {
    return {
      daysSinceLastInjection: null,
      nextInjectionDate: null,
      daysUntilNextInjection: null,
      daysOverdue: null,
      isOverdue: false,
      nextInjectionLabel: null,
      injectionIntervalDays,
    };
  }

  const lastDay = dayjs(lastInjectionAt).startOf("day");
  const today = dayjs().startOf("day");
  const daysSinceLastInjection = today.diff(lastDay, "day");
  const nextInjectionDate = addDays(new Date(lastInjectionAt), injectionIntervalDays);
  const daysFromNext = today.diff(dayjs(nextInjectionDate).startOf("day"), "day");

  if (daysFromNext > 0) {
    return {
      daysSinceLastInjection,
      nextInjectionDate,
      daysUntilNextInjection: 0,
      daysOverdue: daysFromNext,
      isOverdue: true,
      nextInjectionLabel: `Your injection was ${daysFromNext} day${daysFromNext === 1 ? "" : "s"} ago`,
      injectionIntervalDays,
    };
  }

  if (daysFromNext === 0) {
    return {
      daysSinceLastInjection,
      nextInjectionDate,
      daysUntilNextInjection: 0,
      daysOverdue: null,
      isOverdue: false,
      nextInjectionLabel: "Today",
      injectionIntervalDays,
    };
  }

  const daysUntilNextInjection = Math.abs(daysFromNext);

  return {
    daysSinceLastInjection,
    nextInjectionDate,
    daysUntilNextInjection,
    daysOverdue: null,
    isOverdue: false,
    nextInjectionLabel: `Next injection in: ${daysUntilNextInjection} day${daysUntilNextInjection === 1 ? "" : "s"}`,
    injectionIntervalDays,
  };
};
