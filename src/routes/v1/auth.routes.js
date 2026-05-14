import { Router } from "express";
import { validate } from "../../middlewares/validate.middleware.js";
import { verifyToken } from "../../middlewares/auth.middleware.js";
import { upload } from "../../middlewares/upload.middleware.js";
import { otpLimiter } from "../../middlewares/rateLimiter.middleware.js";
import { requestOtpSchema, verifyOtpSchema, refreshTokenSchema } from "../../validators/auth.validator.js";
import * as authController from "../../controllers/auth.controller.js";

const router = Router();

// POST /api/v1/auth/request-otp
router.post("/request-otp", otpLimiter, validate(requestOtpSchema), authController.requestOtp);

// POST /api/v1/auth/verify-otp
router.post("/verify-otp", validate(verifyOtpSchema), authController.verifyOtp);

// POST /api/v1/auth/refresh-token
router.post("/refresh-token", validate(refreshTokenSchema), authController.refreshToken);

// POST /api/v1/auth/logout
router.post("/logout", verifyToken, authController.logout);

// PUT /api/v1/auth/complete-onboarding
router.put("/complete-onboarding", verifyToken, authController.completeOnboarding);

// POST /api/v1/auth/upload-avatar
router.post("/upload-avatar", verifyToken, upload.single("avatar"), authController.uploadAvatar);

export default router;
