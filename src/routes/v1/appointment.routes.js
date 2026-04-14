import { Router } from "express";
import { verifyToken } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";
import { validate, validateQuery } from "../../middlewares/validate.middleware.js";
import { getSlotsSchema, bookAppointmentSchema } from "../../validators/appointment.validator.js";
import * as appointmentController from "../../controllers/appointment.controller.js";

const router = Router();

// All appointment routes require auth + patient role
router.use(verifyToken, allowRoles("patient"));

// GET /api/v1/appointments/slots?providerId=...&date=...
router.get("/slots", validateQuery(getSlotsSchema), appointmentController.getSlots);

// POST /api/v1/appointments/book
router.post("/book", validate(bookAppointmentSchema), appointmentController.bookAppointment);

// DELETE /api/v1/appointments/:id/cancel
router.delete("/:id/cancel", appointmentController.cancelAppointment);

export default router;
