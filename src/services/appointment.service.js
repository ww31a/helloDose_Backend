import { Appointment } from "../models/appointment.model.js";
import { Patient } from "../models/patient.model.js";
import { Provider } from "../models/provider.model.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import * as calcomService from "./calcom.service.js";

/**
 * Get available time slots for a provider on a given date
 */
export const getSlots = async (patientUserId, providerId, date) => {
  // Verify the provider exists and has a Cal.com event type
  const provider = await Provider.findOne({ user: providerId });
  if (!provider) {
    throw new ApiError(404, "Provider not found");
  }

  if (!provider.calcom_event_slug || !provider.calcom_username) {
    throw new ApiError(400, "Provider does not have scheduling configured (missing username or slug)");
  }

  // Fetch slots from Cal.com
  const result = await calcomService.getAvailableSlots({
    eventTypeSlug: provider.calcom_event_slug,
    username: provider.calcom_username,
    date,
    timeZone: "Asia/Karachi", // Defaulting to user's timezone
  });

  return result;
};

/**
 * Book an appointment via Cal.com
 */
export const bookAppointment = async (patientUserId, providerId, startTime) => {
  // Get patient info
  const patientUser = await User.findById(patientUserId);
  if (!patientUser) throw new ApiError(404, "Patient not found");

  // Get provider info
  const provider = await Provider.findOne({ user: providerId });
  if (!provider) throw new ApiError(404, "Provider not found");

  if (!provider.calcom_event_slug || !provider.calcom_username) {
    throw new ApiError(400, "Provider does not have scheduling configured (missing username or slug)");
  }

  // Create booking on Cal.com
  const calBooking = await calcomService.createBooking({
    eventTypeSlug: provider.calcom_event_slug,
    username: provider.calcom_username,
    startTime,
    name: `${patientUser.firstName} ${patientUser.lastName}`,
    email: patientUser.email,
    patientId: patientUserId.toString(),
    providerId: providerId.toString(),
    timeZone: "Asia/Karachi",
  });

  // Save appointment to our DB
  const appointment = await Appointment.create({
    patient: patientUserId,
    provider: providerId,
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
