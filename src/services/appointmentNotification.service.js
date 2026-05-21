import dayjs from "dayjs";
import { Appointment } from "../models/appointment.model.js";
import { User } from "../models/user.model.js";
import { NOTIFICATION_TYPES } from "./notificationTemplates.js";
import { sendNotificationTypeToUser } from "./notification.service.js";

export const sendAppointmentScheduledNotification = async (appointment) => {
  if (!appointment || appointment.status !== "scheduled" || appointment.reminderSent) {
    return { sent: false, skipped: true };
  }

  const providerUser = await User.findById(appointment.provider).select("firstName lastName");
  const providerName = providerUser
    ? `${providerUser.firstName} ${providerUser.lastName}`
    : "your provider";

  const result = await sendNotificationTypeToUser(
    appointment.patient,
    NOTIFICATION_TYPES.UPCOMING_APPOINTMENT,
    {
      patientId: appointment.patient,
      providerId: appointment.provider,
      appointmentId: appointment._id,
      providerName,
      date: dayjs(appointment.startTime).format("MMM D, YYYY"),
      time: dayjs(appointment.startTime).format("h:mm A"),
    }
  );

  if (result.sent > 0) {
    await Appointment.findByIdAndUpdate(appointment._id, { reminderSent: true });
  }

  return { sent: result.sent > 0, result };
};
