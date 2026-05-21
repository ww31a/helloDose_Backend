import { Router } from "express";
import authRoutes from "./auth.routes.js";
import patientRoutes from "./patient.routes.js";
import providerRoutes from "./provider.routes.js";
import appointmentRoutes from "./appointment.routes.js";
import webhookRoutes from "./webhook.routes.js";
import notificationRoutes from "./notification.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/patient", patientRoutes);
router.use("/provider", providerRoutes);
router.use("/appointments", appointmentRoutes);
router.use("/webhooks", webhookRoutes);
router.use("/notifications", notificationRoutes);

export default router;
