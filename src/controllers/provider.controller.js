import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import * as providerService from "../services/provider.service.js";

export const getPatients = asyncHandler(async (req, res) => {
  const data = await providerService.getPatients(req.user._id);
  res.status(200).json(new ApiResponse(200, data, "Patients fetched"));
});

export const getPatientDetail = asyncHandler(async (req, res) => {
  const data = await providerService.getPatientDetail(req.user._id, req.params.id);
  res.status(200).json(new ApiResponse(200, data, "Patient details fetched"));
});

export const requestCheckin = asyncHandler(async (req, res) => {
  await providerService.requestCheckin(req.user._id, req.body.patientId);
  res.status(200).json(new ApiResponse(200, null, "Check-in request sent to patient"));
});

export const getDashboard = asyncHandler(async (req, res) => {
  const data = await providerService.getDashboard(req.user._id);
  res.status(200).json(new ApiResponse(200, data, "Provider dashboard loaded"));
});

export const getProfile = asyncHandler(async (req, res) => {
  const data = await providerService.getProfile(req.user._id);
  res.status(200).json(new ApiResponse(200, data, "Provider profile loaded"));
});

export const getAvailability = asyncHandler(async (req, res) => {
  const data = await providerService.getAvailability(req.user._id);
  res.status(200).json(new ApiResponse(200, data, "Availability fetched"));
});

export const updateAvailability = asyncHandler(async (req, res) => {
  await providerService.updateAvailability(req.user._id, req.body);
  res.status(200).json(new ApiResponse(200, null, "Availability updated and synced to Cal.com"));
});
