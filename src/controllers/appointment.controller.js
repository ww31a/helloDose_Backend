import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import * as appointmentService from "../services/appointment.service.js";

export const getSlots = asyncHandler(async (req, res) => {
  const { providerId, date } = req.query;
  const data = await appointmentService.getSlots(req.user._id, providerId, date);
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
