import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import * as patientService from "../services/patient.service.js";

export const getDashboard = asyncHandler(async (req, res) => {
  const data = await patientService.getDashboard(req.user._id);
  res.status(200).json(new ApiResponse(200, data, "Dashboard loaded"));
});

export const getMyNp = asyncHandler(async (req, res) => {
  const data = await patientService.getMyNp(req.user._id);
  res.status(200).json(new ApiResponse(200, data, "NP details fetched"));
});

export const logWeight = asyncHandler(async (req, res) => {
  const { weight, unit, loggedAt } = req.body;
  const data = await patientService.logWeight(req.user._id, weight, unit, loggedAt);
  res.status(201).json(new ApiResponse(201, data, "Weight logged successfully"));
});

export const logInjection = asyncHandler(async (req, res) => {
  const { site, injectedAt, dosage, notes, internalNotes, programId, medication } = req.body;
  const data = await patientService.logInjection(
    req.user._id,
    site,
    injectedAt,
    dosage,
    notes || internalNotes,
    programId,
    medication
  );
  res.status(201).json(new ApiResponse(201, data, "Injection logged successfully"));
});

export const getWeightHistory = asyncHandler(async (req, res) => {
  const data = await patientService.getWeightHistory(req.user._id);
  res.status(200).json(new ApiResponse(200, data, "Weight history fetched"));
});

export const getInjectionHistory = asyncHandler(async (req, res) => {
  const { programId } = req.query;
  const data = await patientService.getInjectionHistory(req.user._id, programId);
  res.status(200).json(new ApiResponse(200, data, "Injection history fetched"));
});
