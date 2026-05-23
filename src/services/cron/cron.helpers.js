/**
 * cron.helpers.js
 *
 * Shared utilities across all cron job files.
 */

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { Plan } from "../../models/plan.model.js";
import { User } from "../../models/user.model.js";
import { sendNotificationTypeToUser } from "../notification.service.js";

dayjs.extend(utc);
dayjs.extend(timezone);

// ─────────────────────────────────────────────
// Date helpers (all timezone-aware)
// ─────────────────────────────────────────────

export const isToday = (date, tz) =>
  dayjs(date).tz(tz).isSame(dayjs().tz(tz), "day");

export const isYesterday = (date, tz) =>
  dayjs(date).tz(tz).isSame(dayjs().tz(tz).subtract(1, "day"), "day");

export const isTomorrow = (date, tz) =>
  dayjs(date).tz(tz).isSame(dayjs().tz(tz).add(1, "day"), "day");

// ─────────────────────────────────────────────
// Timezone-aware patient filtering
// ─────────────────────────────────────────────

/**
 * Returns patient user IDs whose LOCAL time currently matches targetHour.
 * The hourly cron calls this so each job only runs for patients
 * where it is currently the right time locally.
 *
 * @param {number} targetHour  0-23
 * @returns {Promise<string[]>}
 */
export const getPatientIdsAtLocalHour = async (targetHour) => {
  const users = await User.find({ role: "patient" })
    .select("_id timezone")
    .lean();

  return users
    .filter((u) => {
      const tz = u.timezone || "America/New_York";
      return dayjs().tz(tz).hour() === targetHour;
    })
    .map((u) => u._id.toString());
};

/**
 * Returns a patient's stored timezone, with a safe fallback.
 * @param {string} userId
 */
export const getUserTimezone = async (userId) => {
  const user = await User.findById(userId).select("timezone").lean();
  return user?.timezone || "America/New_York";
};

// ─────────────────────────────────────────────
// Plan helpers
// ─────────────────────────────────────────────

/**
 * Map of patientUserId → Plan[] for all active plans.
 * Optionally scoped to a whitelist of patient IDs.
 *
 * @param {string[]} [filterToIds]
 * @returns {Promise<Map<string, object[]>>}
 */
export const fetchActivePlansByPatient = async (filterToIds) => {
  const query = { isActive: true };
  if (filterToIds?.length) query.patient = { $in: filterToIds };

  const plans = await Plan.find(query).lean();
  const map = new Map();

  for (const plan of plans) {
    const key = plan.patient.toString();
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(plan);
  }

  return map;
};

// ─────────────────────────────────────────────
// Safe send
// ─────────────────────────────────────────────

/**
 * Fire a notification and swallow errors so one bad token
 * never kills the entire batch.
 */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export const safelySend = async (userId, type, payload = {}, retries = 2) => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await sendNotificationTypeToUser(userId, type, payload);
      return;
    } catch (err) {
      if (attempt === retries) {
        console.error(`[cron] Final failure ${type} user ${userId}`, err);
        return;
      }

      await sleep(500 * Math.pow(2, attempt)); // exponential backoff
    }
  }
};