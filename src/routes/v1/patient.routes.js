import { Router } from "express";
import { verifyToken } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { upload } from "../../middlewares/upload.middleware.js";
import { createWeightLogSchema } from "../../validators/weightLog.validator.js";
import { createInjectionLogSchema } from "../../validators/injectionLog.validator.js";
import * as patientController from "../../controllers/patient.controller.js";

const router = Router();

// All patient routes require auth + patient role
router.use(verifyToken, allowRoles("patient"));

// GET /api/v1/patient/dashboard
router.get("/dashboard", patientController.getDashboard);

// GET /api/v1/patient/active-plans
router.get("/active-plans", patientController.getActivePlans);

// GET /api/v1/patient/onboarding-status
router.get("/onboarding-status", patientController.getOnboardingStatus);

// PUT /api/v1/patient/onboarding-progress
router.put("/onboarding-progress", patientController.markOnboardingStep);

// PUT /api/v1/patient/plan/:id/dosage
router.put("/plan/:id/dosage", patientController.updatePlanDosage);

// PUT /api/v1/patient/onboarding-weights
router.put("/onboarding-weights", patientController.updateOnboardingWeights);

// GET /api/v1/patient/my-np
router.get("/my-np", patientController.getMyNp);

// POST /api/v1/patient/weight-log
router.post("/weight-log", validate(createWeightLogSchema), patientController.logWeight);

// POST /api/v1/patient/injection-log
router.post("/injection-log", validate(createInjectionLogSchema), patientController.logInjection);

// GET /api/v1/patient/weight-history
router.get("/weight-history", patientController.getWeightHistory);

// GET /api/v1/patient/injection-history
router.get("/injection-history", patientController.getInjectionHistory);

// POST /api/v1/patient/upload-avatar
router.post("/upload-avatar", upload.single("avatar"), patientController.uploadAvatar);

export default router;
