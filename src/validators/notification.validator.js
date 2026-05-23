import Joi from "joi";
import { NOTIFICATION_TYPES } from "../services/notificationTemplates.js";

export const registerDeviceTokenSchema = Joi.object({
  token: Joi.string().required(),
  platform: Joi.string().valid("ios", "android", "unknown").default("unknown"),
  appVersion: Joi.string().allow("").optional(),
  timezone: Joi.string().optional().allow(null, ""),
});

export const unregisterDeviceTokenSchema = Joi.object({
  token: Joi.string().required(),
});

export const updateNotificationPreferencesSchema = Joi.object({
  weightLogRemindersEnabled: Joi.boolean().optional(),
}).min(1);

export const sendNotificationSchema = Joi.object({
  userId: Joi.string().optional(),
  type: Joi.string()
    .valid(...Object.values(NOTIFICATION_TYPES))
    .required(),
  payload: Joi.object().default({}),
});
