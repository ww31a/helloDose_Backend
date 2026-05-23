/**
 * jobs/checkinReminders.job.js
 *
 * Trigger type: 2-STEP SEQUENCE — fires at the patient's local 10:00.
 *
 * This job does NOT send the initial NP_CHECKIN_REQUEST — that is a manual
 * action already handled in provider.service.js → requestCheckin().
 *
 * This job handles what happens AFTER the provider has requested a check-in
 * and the patient has not yet booked an appointment:
 *
 *   Day 1–3 after request  →  SCHEDULE_CHECKIN_REMINDER  ("don't forget")
 *   Day 4+  after request  →  SCHEDULE_CHECKIN_OVERDUE   ("still need to")
 *
 * Auto-clear: if the patient has already booked a future appointment,
 * the checkinRequested flag is cleared and no notification is sent.
 *
 * ─── Required model addition (patient.model.js) ──────────────────────────────
 *   checkinRequested:   { type: Boolean, default: false },
 *   checkinRequestedAt: { type: Date },   // ← add if not already present
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ─── Required service update (provider.service.js → requestCheckin) ──────────
 *   await Patient.findOneAndUpdate(
 *     { user: patientId },
 *     { checkinRequested: true, checkinRequestedAt: new Date() }
 *   );
 * ─────────────────────────────────────────────────────────────────────────────
 */

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { Patient } from "../../models/patient.model.js";
import { Appointment } from "../../models/appointment.model.js";
import { getPatientIdsAtLocalHour, safelySend } from "../cron/cron.helpers.js";
import { NOTIFICATION_TYPES } from "../notificationTemplates.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const TARGET_HOUR = 14;
const OVERDUE_THRESHOLD_DAYS = 4;

export const runCheckinReminders = async () => {
  console.log("[cron] runCheckinReminders started");

  const patientIds = await getPatientIdsAtLocalHour(TARGET_HOUR);
  if (!patientIds.length) return;

  // Find patients with an open check-in request, scoped to current-hour cohort
  const pendingPatients = await Patient.find({
    user: { $in: patientIds },
    checkinRequested: true,
  })
    .populate("user", "_id timezone")
    .lean();

  for (const patient of pendingPatients) {
    const userId = patient.user._id.toString();
    const tz = patient.user.timezone || "America/New_York";

    try {
      // ── Auto-clear: patient already booked ────────────────────────────────
      const upcoming = await Appointment.findOne({
        patient: userId,
        status: "scheduled",
        startTime: { $gt: new Date() },
      }).lean();

      if (upcoming) {
        await Patient.updateOne(
          { _id: patient._id },
          { $set: { checkinRequested: false, checkinRequestedAt: null } }
        );
        continue;
      }

      // ── Determine escalation level ─────────────────────────────────────────
      const requestedAt = patient.checkinRequestedAt
        ? dayjs(patient.checkinRequestedAt).tz(tz)
        : null;

      // Default to OVERDUE if the timestamp was never stored (data gap safety)
      const daysOpen = requestedAt
        ? dayjs().tz(tz).diff(requestedAt, "day")
        : OVERDUE_THRESHOLD_DAYS;

      const type =
        daysOpen < OVERDUE_THRESHOLD_DAYS
          ? NOTIFICATION_TYPES.SCHEDULE_CHECKIN_REMINDER
          : NOTIFICATION_TYPES.SCHEDULE_CHECKIN_OVERDUE;

      await safelySend(userId, type, { patientId: userId });
    } catch (err) {
      console.error(`[cron] checkinReminders error for user ${userId}:`, err.message);
    }
  }

  console.log("[cron] runCheckinReminders finished");
};