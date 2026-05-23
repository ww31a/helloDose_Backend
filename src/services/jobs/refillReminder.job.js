/**
 * jobs/refillReminder.job.js
 *
 * Trigger type: DAILY CRON — fires at the patient's local 09:00.
 *
 * Sends NEXT_REFILL_REMINDER when the computed next refill date
 * is 3 days away or fewer. The threshold check runs daily so the
 * patient gets reminded for up to 3 days if they haven't acted.
 *
 * Refill date logic lives in utils/refillDate.js (getDaysUntilNextRefill).
 * This job does not duplicate that logic — it just decides whether to notify.
 */

import {
  getPatientIdsAtLocalHour,
  fetchActivePlansByPatient,
  safelySend,
} from "../cron/cron.helpers.js";
import { getDaysUntilNextRefill } from "../../utils/refillDate.js";
import { NOTIFICATION_TYPES } from "../notificationTemplates.js";

const TARGET_HOUR = 14;
const REFILL_THRESHOLD_DAYS = 3;

export const runRefillReminder = async () => {
  console.log("[cron] runRefillReminder started");

  const patientIds = await getPatientIdsAtLocalHour(TARGET_HOUR);
  if (!patientIds.length) return;

  const plansByPatient = await fetchActivePlansByPatient(patientIds);

  for (const [userId, plans] of plansByPatient) {
    for (const plan of plans) {
      try {
        const daysUntil = getDaysUntilNextRefill(plan.startedAt);

        // null  → refill logic not applicable for this plan type
        // < 0   → already overdue, do not repeat here
        // > threshold → not yet close enough
        if (daysUntil === null || daysUntil < 0 || daysUntil > REFILL_THRESHOLD_DAYS) continue;

        await safelySend(userId, NOTIFICATION_TYPES.NEXT_REFILL_REMINDER, {
          patientId: userId,
          planId: plan._id.toString(),
          medicationName: plan.name,
        });
      } catch (err) {
        console.error(`[cron] refillReminder error for user ${userId}:`, err.message);
      }
    }
  }

  console.log("[cron] runRefillReminder finished");
};