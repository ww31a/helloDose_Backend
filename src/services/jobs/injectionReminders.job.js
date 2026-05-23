/**
 * jobs/injectionReminders.job.js
 *
 * Trigger type: 3-PART SEQUENCE — all derived from the patient's last
 *               logged injection + a 7-day GLP-1 cycle.
 *
 *  runInjectionTomorrow  — patient's local 09:00
 *                          Next injection is tomorrow → remind + prep tips
 *
 *  runInjectionToday     — patient's local 10:00
 *                          Next injection is today, not yet logged → prompt
 *
 *  runInjectionMissed    — patient's local 10:00 (next day)
 *                          *** ONLY fires if the injection was NOT logged ***
 *                          This is the automatic cancellation: if the patient
 *                          logged yesterday or today, MISSED is skipped.
 *
 * Sequence diagram:
 *
 *   Day N-1 @ 09:00  →  INJECTION_TOMORROW
 *   Day N   @ 10:00  →  INJECTION_TODAY        (skip if already logged today)
 *   Day N+1 @ 10:00  →  INJECTION_MISSED       (skip if logged yesterday OR today)
 *                        ↑ this is the "cancel 3rd if logged" behaviour
 */

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { InjectionLog } from "../../models/injectionLog.model.js";
import {
  getPatientIdsAtLocalHour,
  fetchActivePlansByPatient,
  getUserTimezone,
  isToday,
  isYesterday,
  isTomorrow,
  safelySend,
} from "../cron/cron.helpers.js";
import { NOTIFICATION_TYPES } from "../notificationTemplates.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const INJECTION_INTERVAL_DAYS = 7; // GLP-1 medications are weekly

// ─────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────

const getLatestInjection = (userId, plan) =>
  InjectionLog.findOne({
    patient: userId,
    $or: [{ plan: plan._id }, { medication: plan.name }],
  })
    .sort({ injectedAt: -1 })
    .lean();

const getNextInjectionDate = (lastInjectedAt, tz) =>
  dayjs(lastInjectedAt).tz(tz).add(INJECTION_INTERVAL_DAYS, "day");

// ─────────────────────────────────────────────
// 1. Injection Tomorrow  (patient local 09:00)
// ─────────────────────────────────────────────

export const runInjectionTomorrow = async () => {
  console.log("[cron] runInjectionTomorrow started");

  const patientIds = await getPatientIdsAtLocalHour(10);
  if (!patientIds.length) return;

  const plansByPatient = await fetchActivePlansByPatient(patientIds);

  for (const [userId, plans] of plansByPatient) {
    const tz = await getUserTimezone(userId);

    for (const plan of plans) {
      try {
        const latest = await getLatestInjection(userId, plan);
        if (!latest) continue;

        const nextDate = getNextInjectionDate(latest.injectedAt, tz);
        if (!isTomorrow(nextDate, tz)) continue;

        await safelySend(userId, NOTIFICATION_TYPES.INJECTION_TOMORROW, {
          patientId: userId,
          planId: plan._id.toString(),
          medicationName: plan.name,
        });
      } catch (err) {
        console.error(`[cron] injectionTomorrow error for user ${userId}:`, err.message);
      }
    }
  }

  console.log("[cron] runInjectionTomorrow finished");
};

// ─────────────────────────────────────────────
// 2. Injection Today  (patient local 10:00)
// ─────────────────────────────────────────────

export const runInjectionToday = async () => {
  console.log("[cron] runInjectionToday started");

  const patientIds = await getPatientIdsAtLocalHour(10);
  if (!patientIds.length) return;

  const plansByPatient = await fetchActivePlansByPatient(patientIds);

  for (const [userId, plans] of plansByPatient) {
    const tz = await getUserTimezone(userId);

    for (const plan of plans) {
      try {
        const latest = await getLatestInjection(userId, plan);
        if (!latest) continue;

        // Patient already logged today — sequence complete, skip
        if (isToday(latest.injectedAt, tz)) continue;

        const nextDate = getNextInjectionDate(latest.injectedAt, tz);
        if (!isToday(nextDate, tz)) continue;

        await safelySend(userId, NOTIFICATION_TYPES.INJECTION_TODAY, {
          patientId: userId,
          planId: plan._id.toString(),
          medicationName: plan.name,
        });
      } catch (err) {
        console.error(`[cron] injectionToday error for user ${userId}:`, err.message);
      }
    }
  }

  console.log("[cron] runInjectionToday finished");
};

// ─────────────────────────────────────────────
// 3. Injection Missed  (patient local 10:00, day after injection day)
//
//    AUTO-CANCEL: if the patient logged yesterday OR today,
//    this notification is skipped entirely — no missed alert needed.
// ─────────────────────────────────────────────

export const runInjectionMissed = async () => {
  console.log("[cron] runInjectionMissed started");

  const patientIds = await getPatientIdsAtLocalHour(10);
  if (!patientIds.length) return;

  const plansByPatient = await fetchActivePlansByPatient(patientIds);

  for (const [userId, plans] of plansByPatient) {
    const tz = await getUserTimezone(userId);

    for (const plan of plans) {
      try {
        const latest = await getLatestInjection(userId, plan);
        if (!latest) continue;

        // ── AUTO-CANCEL: patient logged recently, sequence already fulfilled ──
        if (isToday(latest.injectedAt, tz) || isYesterday(latest.injectedAt, tz)) continue;

        // The predicted injection date must have been yesterday (one day overdue)
        const nextDate = getNextInjectionDate(latest.injectedAt, tz);
        if (!isYesterday(nextDate, tz)) continue;

        await safelySend(userId, NOTIFICATION_TYPES.INJECTION_MISSED, {
          patientId: userId,
          planId: plan._id.toString(),
          medicationName: plan.name,
        });
      } catch (err) {
        console.error(`[cron] injectionMissed error for user ${userId}:`, err.message);
      }
    }
  }

  console.log("[cron] runInjectionMissed finished");
};