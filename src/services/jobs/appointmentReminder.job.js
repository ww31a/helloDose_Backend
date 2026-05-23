/**
 * jobs/appointmentReminder.job.js
 *
 * Trigger type: ABSOLUTE TIME — runs every hour, looks for appointments
 *               whose startTime falls within the next 23–25 hour window.
 *
 * Why absolute and not local-hour? Because "24 hours before your appointment"
 * is a fixed real-world interval, not a time-of-day preference. A patient with
 * an appointment at 3 PM tomorrow should get the reminder at ~3 PM today,
 * regardless of their timezone.
 *
 * The 2-hour window (23h–25h) gives a safe buffer so no appointment is missed
 * between hourly ticks.
 *
 * Note: The UPCOMING_APPOINTMENT notification that fires immediately on booking
 *       is already handled in appointment.service.js → bookAppointment().
 *       This job is strictly the 24-hours-before reminder.
 */

import dayjs from "dayjs";
import { Appointment } from "../../models/appointment.model.js";
import { User } from "../../models/user.model.js";
import { Plan } from "../../models/plan.model.js";
import { NOTIFICATION_TYPES } from "../notificationTemplates.js";
import { safelySend } from "../cron/cron.helpers.js";

// Window: appointments starting between 23h and 25h from now
const WINDOW_START_HOURS = 23;
const WINDOW_END_HOURS = 25;

export const runAppointmentReminder = async () => {
  console.log("[cron] runAppointmentReminder started");

  const now = dayjs();
  const windowStart = now.add(WINDOW_START_HOURS, "hour").toDate();
  const windowEnd = now.add(WINDOW_END_HOURS, "hour").toDate();

  const appointments = await Appointment.find({
    status: "scheduled",
    startTime: { $gte: windowStart, $lte: windowEnd },
  })
    .populate("provider", "firstName lastName")
    .lean();

  for (const apt of appointments) {
    const patientId = apt.patient.toString();

    try {
      // Get the patient's medication name from their active plan (best effort)
      const activePlan = await Plan.findOne({
        patient: patientId,
        isActive: true,
      })
        .select("name")
        .lean();

      const providerName = apt.provider
        ? `${apt.provider.firstName} ${apt.provider.lastName}`
        : "your provider";

      await safelySend(patientId, NOTIFICATION_TYPES.UPCOMING_APPOINTMENT, {
        patientId,
        providerId: apt.provider?._id?.toString(),
        appointmentId: apt._id.toString(),
        providerName,
        date: dayjs(apt.startTime).format("MMM D, YYYY"),
        time: dayjs(apt.startTime).format("h:mm A"),
        medicationName: activePlan?.name,
      });
    } catch (err) {
      console.error(
        `[cron] appointmentReminder error for patient ${patientId}:`,
        err.message
      );
    }
  }

  console.log(`[cron] runAppointmentReminder finished — ${appointments.length} appointment(s) found`);
};