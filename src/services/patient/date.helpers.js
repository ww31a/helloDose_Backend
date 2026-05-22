import { MS_PER_DAY } from "./constants.js";

export const addDays = (date, days) => new Date(date.getTime() + days * MS_PER_DAY);

export const getDayLabel = (days, suffix = "days") => {
  if (days === 0) return "Today";
  if (days === 1) return `1 ${suffix.slice(0, -1)}`;
  return `${days} ${suffix}`;
};

export const getDaysUntilDate = (targetDate) => {
  if (!targetDate) return null;
  return Math.ceil((new Date(targetDate) - new Date()) / MS_PER_DAY);
};
