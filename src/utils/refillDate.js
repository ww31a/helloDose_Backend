import dayjs from "dayjs";

const REFILL_INTERVAL_DAYS = 30;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Next refill occurs every 30 days from plan start.
 * Once a refill day has arrived or passed, advance to the following cycle.
 */
export function getNextRefillDate(startedAt) {
  if (!startedAt) return null;

  const start = dayjs(startedAt).startOf("day");
  if (!start.isValid()) return null;

  const today = dayjs().startOf("day");
  let refillDate = start;

  while (refillDate.isBefore(today, "day") || refillDate.isSame(today, "day")) {
    refillDate = refillDate.add(REFILL_INTERVAL_DAYS, "day");
  }

  return refillDate.toDate();
}

export function getDaysUntilNextRefill(startedAt) {
  const nextRefill = getNextRefillDate(startedAt);
  if (!nextRefill) return null;
  return Math.ceil((nextRefill - new Date()) / MS_PER_DAY);
}

export function getRefillEligibleLabel(startedAt) {
  const nextRefill = getNextRefillDate(startedAt);
  if (!nextRefill) return null;
  return `Eligible ${dayjs(nextRefill).format("MMM D, YYYY")}`;
}

export function getRefillSubLabel(startedAt) {
  const daysUntil = getDaysUntilNextRefill(startedAt);
  if (daysUntil === null) return null;
  if (daysUntil <= 0) return "Available now";
  if (daysUntil === 1) return "Tomorrow";
  if (daysUntil < 7) return `In ${daysUntil} days`;
  const weeks = Math.ceil(daysUntil / 7);
  if (daysUntil < 30) {
    return weeks === 1 ? "In 1 week" : `In ${weeks} weeks`;
  }
  return dayjs(getNextRefillDate(startedAt)).format("MMM D, YYYY");
}
