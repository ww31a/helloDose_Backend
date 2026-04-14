import { Router } from "express";
import { verifyToken } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { createWeightLogSchema } from "../../validators/weightLog.validator.js";
import { createInjectionLogSchema } from "../../validators/injectionLog.validator.js";
import * as patientController from "../../controllers/patient.controller.js";

const router = Router();

// All patient routes require auth + patient role
router.use(verifyToken, allowRoles("patient"));

// GET /api/v1/patient/dashboard
router.get("/dashboard", patientController.getDashboard);

// GET /api/v1/patient/my-np
router.get("/my-np", patientController.getMyNp);

// POST /api/v1/patient/weight
router.post("/weight", validate(createWeightLogSchema), patientController.logWeight);

// POST /api/v1/patient/injection
router.post("/injection", validate(createInjectionLogSchema), patientController.logInjection);

// GET /api/v1/patient/weight-history
router.get("/weight-history", patientController.getWeightHistory);

// GET /api/v1/patient/injection-history
router.get("/injection-history", patientController.getInjectionHistory);

export default router;
