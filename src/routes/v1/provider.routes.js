import { Router } from "express";
import { verifyToken } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { requestCheckinSchema } from "../../validators/provider.validator.js";
import * as providerController from "../../controllers/provider.controller.js";

const router = Router();

// All provider routes require auth + provider role
router.use(verifyToken, allowRoles("provider"));

// GET /api/v1/provider/patients
router.get("/patients", providerController.getPatients);

// GET /api/v1/provider/patients/:id
router.get("/patients/:id", providerController.getPatientDetail);

// POST /api/v1/provider/request-checkin
router.post("/request-checkin", validate(requestCheckinSchema), providerController.requestCheckin);

// GET /api/v1/provider/dashboard
router.get("/dashboard", providerController.getDashboard);

// GET /api/v1/provider/profile
router.get("/profile", providerController.getProfile);

// GET /api/v1/provider/availability
router.get("/availability", providerController.getAvailability);

// PATCH /api/v1/provider/availability
router.patch("/availability", providerController.updateAvailability);

export default router;
