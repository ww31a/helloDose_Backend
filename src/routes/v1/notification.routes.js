import { Router } from "express";
import { verifyToken } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import {
  registerDeviceTokenSchema,
  sendNotificationSchema,
  unregisterDeviceTokenSchema,
  updateNotificationPreferencesSchema,
} from "../../validators/notification.validator.js";
import * as notificationController from "../../controllers/notification.controller.js";

const router = Router();

router.use(verifyToken);

router.post(
  "/device-token",
  validate(registerDeviceTokenSchema),
  notificationController.registerDeviceToken
);

router.delete(
  "/device-token",
  validate(unregisterDeviceTokenSchema),
  notificationController.unregisterDeviceToken
);

router.patch(
  "/preferences",
  validate(updateNotificationPreferencesSchema),
  notificationController.updatePreferences
);

router.post(
  "/send",
  allowRoles("provider"),
  validate(sendNotificationSchema),
  notificationController.sendNotification
);

export default router;
