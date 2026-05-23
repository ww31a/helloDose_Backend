/**
 * cron.service.js
 *
 * Entry point for all scheduled notification jobs.
 * Call initCronJobs() once after your DB connection is confirmed.
 *
 * Install:  npm install node-cron
 *
 * Wire up in server.js:
 *   import { initCronJobs } from "./services/cron/cron.service.js";
 *   mongoose.connect(MONGO_URI).then(() => {
 *     initCronJobs();
 *     app.listen(PORT);
 *   });
 *
 * ─── File structure ───────────────────────────────────────────────────────────
 *  services/cron/
 *  ├── cron.service.js               ← entry point (you are here)
 *  ├── cron.helpers.js               ← shared utilities
 *  └── jobs/
 *      ├── appointmentReminder.job.js
 *      ├── refillReminder.job.js
 *      ├── injectionReminders.job.js
 *      ├── weightLogReminder.job.js
 *      └── checkinReminders.job.js
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ─── Trigger type reference ───────────────────────────────────────────────────
 *
 *  NOTIFICATION              TRIGGER TYPE          SCHEDULE
 *  ──────────────────────────────────────────────────────────────────────────
 *  NEXT_REFILL_REMINDER      Daily cron            Hourly tick → patient 09:00
 *  UPCOMING_APPOINTMENT      Absolute time cron    Hourly tick → 24h before apt
 *  NP_CHECKIN_REQUEST        Manual (NP action)    No cron — provider.service.js
 *  SCHEDULE_CHECKIN_REMINDER 2-step sequence       Hourly tick → patient 10:00
 *  SCHEDULE_CHECKIN_OVERDUE  Escalation (day 4+)   Same job as above
 *  INJECTION_TOMORROW        3-part sequence       Hourly tick → patient 09:00
 *  INJECTION_TODAY           3-part sequence       Hourly tick → patient 10:00
 *  INJECTION_MISSED          3-part (auto-cancel)  Hourly tick → patient 10:00
 *  WEIGHT_LOG_REMINDER       15-day periodic       Hourly tick → patient 09:00
 *
 *  All patient-local-time jobs run on the same hourly tick ("0 * * * *").
 *  Each job internally calls getPatientIdsAtLocalHour(targetHour) so the
 *  notification fires at the right local time per patient, no hardcoded TZ.
 *
 *  The appointment reminder uses an absolute time window (23h–25h from now)
 *  rather than local-hour filtering — "24h before your appointment" is a
 *  fixed real-world interval, not a time-of-day preference.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import cron from "node-cron";
import { runAppointmentReminder } from "../jobs/appointmentReminder.job.js";
import { runRefillReminder } from "../jobs/refillReminder.job.js";
import {
  runInjectionTomorrow,
  runInjectionToday,
  runInjectionMissed,
} from "../jobs/injectionReminders.job.js";
import { runWeightLogReminder } from "../jobs/weightLogReminder.job.js";
import { runCheckinReminders } from "../jobs/checkinReminders.job.js";

// ─────────────────────────────────────────────
// Job registry
// ─────────────────────────────────────────────

const JOBS = [
  // ── Absolute time (no local-hour filtering inside) ──────────────────────
  {
    name: "appointmentReminder",
    triggerType: "absolute",
    description: "UPCOMING_APPOINTMENT — sent 24h before appointment startTime",
    schedule: "0 * * * *", // check every hour; job queries 23–25h window
    fn: runAppointmentReminder,
  },

  // ── Patient local time @ 09:00 ──────────────────────────────────────────
  {
    name: "refillReminder",
    triggerType: "local-time",
    description: "NEXT_REFILL_REMINDER — refill due in ≤3 days @ patient 09:00",
    schedule: "0 * * * *",
    fn: runRefillReminder,
  },
  {
    name: "injectionTomorrow",
    triggerType: "local-time",
    description: "INJECTION_TOMORROW — next injection is tomorrow @ patient 09:00",
    schedule: "0 * * * *",
    fn: runInjectionTomorrow,
  },
  {
    name: "weightLogReminder",
    triggerType: "local-time",
    description: "WEIGHT_LOG_REMINDER — no weight log in 15–16 days @ patient 09:00",
    schedule: "0 * * * *",
    fn: runWeightLogReminder,
  },

  // ── Patient local time @ 10:00 ──────────────────────────────────────────
  {
    name: "injectionToday",
    triggerType: "local-time",
    description: "INJECTION_TODAY — injection day, not yet logged @ patient 10:00",
    schedule: "0 * * * *",
    fn: runInjectionToday,
  },
  {
    name: "injectionMissed",
    triggerType: "local-time",
    description: "INJECTION_MISSED — auto-cancelled if patient already logged @ patient 10:00",
    schedule: "0 * * * *",
    fn: runInjectionMissed,
  },
  {
    name: "checkinReminders",
    triggerType: "local-time",
    description: "SCHEDULE_CHECKIN_REMINDER → OVERDUE escalation @ patient 10:00",
    schedule: "0 * * * *",
    fn: runCheckinReminders,
  },
];

// ─────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────

export const initCronJobs = () => {
  console.log("\n[cron] Initialising scheduled jobs...\n");

  for (const job of JOBS) {
    cron.schedule(job.schedule, async () => {
      try {
        await job.fn();
      } catch (err) {
        console.error(`[cron] Unhandled error in "${job.name}":`, err);
      }
    });

    console.log(`  ✓ ${job.name.padEnd(22)} [${job.triggerType}]  ${job.description}`);
  }

  console.log(`\n[cron] ${JOBS.length} jobs active — running on hourly tick.\n`);
};

// ─────────────────────────────────────────────
// Manual trigger  (Postman / admin endpoint)
// ─────────────────────────────────────────────

/**
 * Manually run any single job by name — useful during development.
 *
 * @example
 * // POST /api/v1/notifications/cron/trigger  { "job": "weightLogReminder" }
 * await triggerJob(req.body.job);
 *
 * Valid names: appointmentReminder | refillReminder | injectionTomorrow |
 *              injectionToday | injectionMissed | weightLogReminder | checkinReminders
 */
export const triggerJob = async (name) => {
  const job = JOBS.find((j) => j.name === name);

  if (!job) {
    const valid = JOBS.map((j) => j.name).join(" | ");
    throw new Error(`Unknown job "${name}". Valid names: ${valid}`);
  }

  console.log(`[cron] Manual trigger: "${name}"`);
  await job.fn();
};