import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import * as patientService from "../services/patient.service.js";

export const getDashboard = asyncHandler(async (req, res) => {
  const data = await patientService.getDashboard(req.user._id);
  res.status(200).json(new ApiResponse(200, data, "Dashboard loaded"));
});

export const getActivePlans = asyncHandler(async (req, res) => {
  const data = await patientService.getActivePlans(req.user._id);
  res.status(200).json(new ApiResponse(200, data, "Active plans fetched"));
});

export const getOnboardingStatus = asyncHandler(async (req, res) => {
  const data = await patientService.getOnboardingStatus(req.user._id);
  res.status(200).json(new ApiResponse(200, data, "Onboarding status fetched"));
});

export const markOnboardingStep = asyncHandler(async (req, res) => {
  const { step } = req.body;
  const data = await patientService.markOnboardingStep(req.user._id, step);
  res.status(200).json(new ApiResponse(200, data, "Onboarding progress updated"));
});

export const updatePlanDosage = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { dosage, frequency, injectionsThisMonth } = req.body;
  const data = await patientService.updatePlanDosage(req.user._id, id, dosage, frequency, injectionsThisMonth);
  res.status(200).json(new ApiResponse(200, data, "Plan dosage updated"));
});

export const updateOnboardingWeights = asyncHandler(async (req, res) => {
  const { startWeight, targetWeightLoss, goalWeight } = req.body;
  const data = await patientService.updateOnboardingWeights(req.user._id, startWeight, targetWeightLoss, goalWeight);
  res.status(200).json(new ApiResponse(200, data, "Onboarding weights updated"));
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
  const { site, injectedAt, dosage, notes, internalNotes, planId, medication } = req.body;
  const data = await patientService.logInjection(
    req.user._id,
    site,
    injectedAt,
    dosage,
    notes || internalNotes,
    planId,
    medication
  );
  res.status(201).json(new ApiResponse(201, data, "Injection logged successfully"));
});

export const getWeightHistory = asyncHandler(async (req, res) => {
  const data = await patientService.getWeightHistory(req.user._id);
  res.status(200).json(new ApiResponse(200, data, "Weight history fetched"));
});

export const getInjectionHistory = asyncHandler(async (req, res) => {
  const { planId } = req.query;
  const data = await patientService.getInjectionHistory(req.user._id, planId);
  res.status(200).json(new ApiResponse(200, data, "Injection history fetched"));
});

export const uploadAvatar = asyncHandler(async (req, res) => {
  const data = await patientService.uploadAvatar(req.user._id, req.file?.buffer);
  res.status(200).json(new ApiResponse(200, data, "Avatar uploaded successfully"));
});
