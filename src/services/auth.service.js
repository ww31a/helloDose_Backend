import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { sendOtpEmail } from "./email.service.js";
import jwt from "jsonwebtoken";

/**
 * Request OTP — find user by email, generate OTP, send email
 */
export const requestOtp = async (email) => {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    throw new ApiError(404, "No account found with this email");
  }

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // Save raw OTP — pre-save hook will hash it
  user.otp = otp;
  user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  await user.save();

  // DEVELOPMENT ONLY: Log OTP to console
  console.log(`\n-----------------------------------------`);
  console.log(`[DEV] OTP for ${user.email}: ${otp}`);
  console.log(`-----------------------------------------\n`);

  // Send OTP email (non-blocking in dev if SendGrid not configured)
  await sendOtpEmail(user.email, otp, user.firstName);

  return { email: user.email };
};

/**
 * Verify OTP — validate, clear OTP fields, generate tokens
 */
export const verifyOtp = async (email, candidateOtp, deviceToken) => {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    throw new ApiError(400, "Invalid email or OTP");
  }

  const isValid = await user.isOtpValid(candidateOtp);
  if (!isValid) {
    throw new ApiError(400, "Invalid or expired OTP");
  }

  // Clear OTP fields
  user.otp = undefined;
  user.otpExpiry = undefined;

  // Save device token if provided
  if (deviceToken) {
    user.deviceToken = deviceToken;
  }

  // Generate tokens
  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();

  // Save raw refresh token — pre-save hook will hash it
  user.refreshToken = refreshToken;
  await user.save();

  return {
    accessToken,
    refreshToken,
    user: {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
    },
  };
};

/**
 * Refresh token — validate old token, rotate, return new pair
 */
export const refreshTokens = async (oldRefreshToken) => {
  // Decode without verifying expiry first to get user ID
  let decoded;
  try {
    decoded = jwt.default.verify(oldRefreshToken, process.env.REFRESH_TOKEN_SECRET);
  } catch {
    throw new ApiError(401, "Invalid or expired refresh token");
  }

  const user = await User.findById(decoded._id);
  if (!user) {
    throw new ApiError(401, "Invalid refresh token — user not found");
  }

  const isValid = await user.isRefreshTokenValid(oldRefreshToken);
  if (!isValid) {
    throw new ApiError(401, "Refresh token has been revoked");
  }

  // Rotate tokens
  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();
  user.refreshToken = refreshToken;
  await user.save();

  return { accessToken, refreshToken };
};

/**
 * Logout — clear refresh token
 */
export const logout = async (userId) => {
  const user = await User.findById(userId);
  if (user) {
    user.refreshToken = null;
    await user.save();
  }
};
