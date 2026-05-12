import Joi from "joi";

export const requestOtpSchema = Joi.object({
  email: Joi.string().email().required(),
  role: Joi.string().valid("patient", "provider").optional(),
});

export const verifyOtpSchema = Joi.object({
  email: Joi.string().email().required(),
  otp: Joi.string().length(6).pattern(/^\d+$/).required(),
  deviceToken: Joi.string().optional().allow(""),
});

export const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required(),
});
