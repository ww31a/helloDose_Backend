import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import * as notificationService from "../services/notification.service.js";

export const registerDeviceToken = asyncHandler(async (req, res) => {
  const data = await notificationService.registerDeviceToken(
    req.user._id,
    req.body.token,
    req.body.platform,
    req.body.appVersion,
    req.body.timezone
  );
  res.status(200).json(new ApiResponse(200, data, "Device token registered"));
});

export const unregisterDeviceToken = asyncHandler(async (req, res) => {
  const data = await notificationService.unregisterDeviceToken(req.user._id, req.body.token);
  res.status(200).json(new ApiResponse(200, data, "Device token unregistered"));
});

export const updatePreferences = asyncHandler(async (req, res) => {
  const data = await notificationService.updateNotificationPreferences(req.user._id, req.body);
  res.status(200).json(new ApiResponse(200, data, "Notification preferences updated"));
});

export const sendNotification = asyncHandler(async (req, res) => {
  const targetUserId = req.body.userId || req.user._id;
  const data = await notificationService.sendNotificationTypeToUser(
    targetUserId,
    req.body.type,
    req.body.payload
  );
  res.status(200).json(new ApiResponse(200, data, "Notification sent"));
});
