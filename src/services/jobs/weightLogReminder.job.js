/**
 * jobs/weightLogReminder.job.js
 *
 * Trigger type: PERIODIC — fires at the patient's local 09:00.
 *
 * Sends WEIGHT_LOG_REMINDER when:
 *   • The patient's last weight entry is exactly 15–16 days ago (sliding window
 *     fires the reminder once per cycle, not every day once overdue).
 *   • OR the patient has never logged weight and has been on a plan for 15–16 days.
 *
 * USER-TOGGLEABLE:
 *   Patients can disable this via PATCH /api/v1/notifications/preferences
 *   { weightLogRemindersEnabled: false }
 *   This job respects that preference and skips opted-out patients entirely.
 */

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { User } from "../../models/user.model.js";
import { WeightLog } from "../../models/weightLog.model.js";
import {
  getPatientIdsAtLocalHour,
  fetchActivePlansByPatient,
  safelySend,
} from "../cron/cron.helpers.js";
import { NOTIFICATION_TYPES } from "../notificationTemplates.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const TARGET_HOUR = 14;
const REMINDER_DAYS = 15;
const WINDOW_SLACK = 1; // send on day 15 or 16 (avoids re-sending every day once overdue)

export const runWeightLogReminder = async () => {
  console.log("[cron] runWeightLogReminder started");

  const patientIds = await getPatientIdsAtLocalHour(TARGET_HOUR);
  if (!patientIds.length) return;

  // Must have at least one active plan
  const plansByPatient = await fetchActivePlansByPatient(patientIds);
  const activePatientIds = [...plansByPatient.keys()];

  // Respect the user's opt-out preference
  const eligibleUsers = await User.find({
    _id: { $in: activePatientIds },
    "notificationPreferences.weightLogRemindersEnabled": { $ne: false },
  })
    .select("_id timezone")
    .lean();

  for (const user of eligibleUsers) {
    const userId = user._id.toString();
    const tz = user.timezone || "America/New_York";

    try {
      const latestWeight = await WeightLog.findOne({ patient: userId })
        .sort({ loggedAt: -1 })
        .lean();

      if (!latestWeight) {
        // ── First-time logger ──
        // Only remind after 15 days on the plan to avoid pinging brand-new patients.
        const plans = plansByPatient.get(userId) || [];
        const oldestPlan = plans.reduce(
          (oldest, p) => (!oldest || p.startedAt < oldest.startedAt ? p : oldest),
          null
        );
        if (!oldestPlan) continue;

        const daysSinceStart = dayjs().tz(tz).diff(dayjs(oldestPlan.startedAt).tz(tz), "day");
        if (daysSinceStart < REMINDER_DAYS || daysSinceStart > REMINDER_DAYS + WINDOW_SLACK) continue;

        await safelySend(userId, NOTIFICATION_TYPES.WEIGHT_LOG_REMINDER, { patientId: userId });
        continue;
      }

      // ── Regular case: check 15-day window ──
      const daysSinceLast = dayjs().tz(tz).diff(dayjs(latestWeight.loggedAt).tz(tz), "day");
      if (daysSinceLast < REMINDER_DAYS || daysSinceLast > REMINDER_DAYS + WINDOW_SLACK) continue;

      await safelySend(userId, NOTIFICATION_TYPES.WEIGHT_LOG_REMINDER, { patientId: userId });
    } catch (err) {
      console.error(`[cron] weightLogReminder error for user ${userId}:`, err.message);
    }
  }

  console.log("[cron] runWeightLogReminder finished");
};