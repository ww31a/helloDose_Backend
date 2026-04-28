import { Appointment } from "../models/appointment.model.js";
import { Patient } from "../models/patient.model.js";
import { Provider } from "../models/provider.model.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import * as calcomService from "./calcom.service.js";
import dayjs from "dayjs";

/**
 * Get available time slots for a provider on a given date
 */
export const getSlots = async (patientUserId, providerId, date, days = 30) => {
  // Verify the provider exists and has a Cal.com event type
  const provider = await Provider.findById(providerId);
  if (!provider) {
    throw new ApiError(404, "Provider not found");
  }

  if (!provider.calcom_event_slug || !provider.calcom_username) {
    throw new ApiError(400, "Provider does not have scheduling configured (missing username or slug)");
  }

  // Calculate date range for Cal.com
  const start = date ? new Date(date) : new Date();
  const end = new Date(start);
  end.setDate(end.getDate() + parseInt(days));

  // Fetch slots from Cal.com
  const result = await calcomService.getAvailableSlots({
    eventTypeId: provider.calcom_event_type_id,
    eventTypeSlug: provider.calcom_event_slug,
    username: provider.calcom_username,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    timeZone: "America/New_York", // Align with provider's timezone
  });

  // Transform to frontend format (group by date + add specific 'slots' array for requested date)
  const formattedData = {};
  Object.keys(result).forEach((d) => {
    formattedData[d] = result[d].map((s) => ({
      time: dayjs(s.start).format("h:mm A"),
      isoTime: s.start,
    }));
  });

  // For SelectTimeSlot screen: it expects a top-level 'slots' array for the specific day
  if (date) {
    const targetDate = dayjs(date).format("YYYY-MM-DD");
    formattedData.slots = formattedData[targetDate] || [];
  }

  return formattedData;
};

/**
 * Book an appointment via Cal.com
 */
export const bookAppointment = async (patientUserId, providerId, startTime) => {
  // Get patient info
  const patientUser = await User.findById(patientUserId);
  if (!patientUser) throw new ApiError(404, "Patient not found");

  // Get provider info
  const provider = await Provider.findById(providerId);
  if (!provider) throw new ApiError(404, "Provider not found");

  if (!provider.calcom_event_slug || !provider.calcom_username) {
    throw new ApiError(400, "Provider does not have scheduling configured (missing username or slug)");
  }

  // Create booking on Cal.com
  const calBooking = await calcomService.createBooking({
    eventTypeId: provider.calcom_event_type_id,
    eventTypeSlug: provider.calcom_event_slug,
    username: provider.calcom_username,
    startTime,
    name: `${patientUser.firstName} ${patientUser.lastName}`,
    email: patientUser.email,
    patientId: patientUserId.toString(),
    providerId: providerId.toString(),
    timeZone: "America/New_York",
  });

  // Save appointment to our DB
  const appointment = await Appointment.create({
    patient: patientUserId,
    provider: provider.user, // CRITICAL FIX: Store User ID, not Provider ID
    calBookingId: calBooking.calBookingId,
    startTime: calBooking.startTime,
    endTime: calBooking.endTime,
    meetingLink: calBooking.meetingLink,
    status: calBooking.status,
  });

  return appointment;
};

/**
 * Cancel an appointment
 */
export const cancelAppointment = async (appointmentId, userId) => {
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) {
    throw new ApiError(404, "Appointment not found");
  }

  // Verify the user is the patient or provider on this appointment
  if (
    appointment.patient.toString() !== userId.toString() &&
    appointment.provider.toString() !== userId.toString()
  ) {
    throw new ApiError(403, "You do not have permission to cancel this appointment");
  }

  if (appointment.status === "cancelled") {
    throw new ApiError(400, "Appointment is already cancelled");
  }

  // Cancel on Cal.com
  if (appointment.calBookingId) {
    try {
      await calcomService.cancelBooking(appointment.calBookingId, "Cancelled by user");
    } catch (error) {
      console.error("Cal.com cancellation failed:", error.message);
      // Continue with local cancellation even if Cal.com fails
    }
  }

  appointment.status = "cancelled";
  await appointment.save();

  return appointment;
};
