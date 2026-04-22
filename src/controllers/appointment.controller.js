import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import * as appointmentService from "../services/appointment.service.js";

export const getSlots = asyncHandler(async (req, res) => {
  const { providerId, date, days } = req.query;
  const data = await appointmentService.getSlots(req.user._id, providerId, date, days);
  res.status(200).json(new ApiResponse(200, data, "Available slots fetched"));
});

export const bookAppointment = asyncHandler(async (req, res) => {
  const { providerId, startTime } = req.body;
  const data = await appointmentService.bookAppointment(req.user._id, providerId, startTime);
  res.status(201).json(new ApiResponse(201, data, "Appointment booked successfully"));
});

export const cancelAppointment = asyncHandler(async (req, res) => {
  const data = await appointmentService.cancelAppointment(req.params.id, req.user._id);
  res.status(200).json(new ApiResponse(200, data, "Appointment cancelled"));
});

/**
 * POST /api/v1/appointments/:id/start-consultation
 *
 * Generate Cal.com meeting link for an appointment.
 * Link is cached — never call Cal.com twice for the same appointment.
 */
export const startConsultation = asyncHandler(async (req, res) => {
  const { Appointment } = await import("../models/appointment.model.js");
  const { generateMeetingLink } = await import("../services/calcom.service.js");

  const appointment = await Appointment.findById(req.params.id).populate("patient provider");

  if (!appointment) {
    throw new ApiError(404, "Appointment not found");
  }

  // Verify requester is the patient or provider on this appointment
  const userId = req.user._id.toString();
  const isPatient = appointment.patient._id.toString() === userId;
  const isProvider = appointment.provider._id.toString() === userId;
  if (!isPatient && !isProvider) {
    throw new ApiError(403, "You are not authorized to access this appointment");
  }

  // Return cached link — never call Cal.com twice
  if (appointment.meetingLink) {
    return res
      .status(200)
      .json(new ApiResponse(200, { meetingLink: appointment.meetingLink }, "Meeting link ready"));
  }

  // Generate new link
  const { meetingLink, cal_booking_id } = await generateMeetingLink({
    provider: appointment.provider,
    appointment,
    patientName: `${appointment.patient.firstName} ${appointment.patient.lastName}`,
    patientEmail: appointment.patient.email,
  });

  appointment.meetingLink = meetingLink;
  appointment.cal_booking_id = cal_booking_id;
  await appointment.save();

  return res
    .status(200)
    .json(new ApiResponse(200, { meetingLink }, "Consultation link generated"));
});
