import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import * as authService from "../services/auth.service.js";

export const requestOtp = asyncHandler(async (req, res) => {
  const result = await authService.requestOtp(req.body.email, req.body.role);
  res.status(200).json(new ApiResponse(200, result, "OTP sent to your email"));
});

export const verifyOtp = asyncHandler(async (req, res) => {
  const { email, otp, deviceToken } = req.body;
  const result = await authService.verifyOtp(email, otp, deviceToken);
  res.status(200).json(new ApiResponse(200, result, "Login successful"));
});

export const refreshToken = asyncHandler(async (req, res) => {
  const result = await authService.refreshTokens(req.body.refreshToken);
  res.status(200).json(new ApiResponse(200, result, "Tokens refreshed"));
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.user._id);
  res.status(200).json(new ApiResponse(200, null, "Logged out successfully"));
});

export const completeOnboarding = asyncHandler(async (req, res) => {
  const result = await authService.completeOnboarding(req.user._id);
  res.status(200).json(new ApiResponse(200, result, "Onboarding completed successfully"));
});

export const uploadAvatar = asyncHandler(async (req, res) => {
  const result = await authService.uploadAvatar(req.user._id, req.file?.buffer);
  res.status(200).json(new ApiResponse(200, result, "Avatar uploaded successfully"));
});
