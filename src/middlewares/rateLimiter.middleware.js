import rateLimit from "express-rate-limit";

export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: {
    statusCode: 429,
    data: null,
    message: "Too many OTP requests, please try again after 15 minutes",
    success: false,
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    statusCode: 429,
    data: null,
    message: "Too many requests, please try again later",
    success: false,
  },
  standardHeaders: true,
  legacyHeaders: false,
});
