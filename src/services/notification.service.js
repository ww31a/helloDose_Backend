import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { getFirebaseAdmin } from "../utils/firebaseAdmin.js";
import { buildNotificationTemplate } from "./notificationTemplates.js";

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const isValidTimezone = (tz) => {
  return typeof tz === "string" && dayjs.tz.zone(tz);
};

const INVALID_TOKEN_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
]);

const stringifyData = (data = {}) =>
  Object.entries(data).reduce((acc, [key, value]) => {
    if (value !== undefined && value !== null) {
      acc[key] = String(value);
    }
    return acc;
  }, {});

const getUserTokens = (user) => {
  const tokens = new Set();
  if (user.deviceToken) tokens.add(user.deviceToken);
  user.deviceTokens?.forEach((item) => {
    if (item.token) tokens.add(item.token);
  });
  return [...tokens];
};

const removeInvalidTokens = async (tokens) => {
  if (!tokens.length) return;

  await User.updateMany({}, { $pull: { deviceTokens: { token: { $in: tokens } } } });
  await User.updateMany({ deviceToken: { $in: tokens } }, { $unset: { deviceToken: "" } });
};

export const registerDeviceToken = async (userId, token, platform = "unknown", appVersion = "", timezone) => {
  if (!token) throw new ApiError(400, "Device token is required");

  await User.updateMany({}, { $pull: { deviceTokens: { token } } });

  const user = await User.findByIdAndUpdate(
    userId,
    {
      $set: { deviceToken: token, ...(timezone && { timezone }) },
      $push: {
        deviceTokens: {
          token,
          platform,
          appVersion,
          lastUsedAt: new Date(),
        },
      },
    },
    { new: true }
  ).select("_id deviceTokens notificationPreferences");

  if (!user) throw new ApiError(404, "User not found");

  return {
    registered: true,
    tokenCount: getUserTokens(user).length,
    preferences: user.notificationPreferences,
  };
};

export const unregisterDeviceToken = async (userId, token) => {
  if (!token) throw new ApiError(400, "Device token is required");

  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, "User not found");

  user.deviceTokens = user.deviceTokens.filter((item) => item.token !== token);
  if (user.deviceToken === token) {
    user.deviceToken = undefined;
  }
  await user.save();

  return { unregistered: true };
};

export const updateNotificationPreferences = async (userId, preferences) => {
  const update = {};

  if (preferences.weightLogRemindersEnabled !== undefined) {
    update["notificationPreferences.weightLogRemindersEnabled"] =
      preferences.weightLogRemindersEnabled;
  }

  const user = await User.findByIdAndUpdate(userId, { $set: update }, { new: true }).select(
    "notificationPreferences"
  );

  if (!user) throw new ApiError(404, "User not found");

  return user.notificationPreferences;
};

export const sendToUser = async (userId, message) => {
  const user = await User.findById(userId).select("deviceToken deviceTokens");
  if (!user) throw new ApiError(404, "User not found");

  const tokens = getUserTokens(user);
  if (!tokens.length) {
    return { sent: 0, failed: 0, skipped: true, reason: "No device tokens registered" };
  }

  const admin = getFirebaseAdmin();
  const response = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: {
      title: message.title,
      body: message.body,
    },
    data: stringifyData(message.data),
    android: {
      priority: "high",
      notification: {
        channelId: "hellodose_reminders",
        sound: "default",
      },
    },
    apns: {
      headers: {
        "apns-priority": "10",
      },
      payload: {
        aps: {
          sound: "default",
        },
      },
    },
  });

  const invalidTokens = [];
  response.responses.forEach((item, index) => {
    if (!item.success && INVALID_TOKEN_CODES.has(item.error?.code)) {
      invalidTokens.push(tokens[index]);
    }
  });

  await removeInvalidTokens(invalidTokens);

  return {
    sent: response.successCount,
    failed: response.failureCount,
    invalidTokensRemoved: invalidTokens.length,
  };
};

export const sendNotificationTypeToUser = async (userId, type, payload = {}) => {
  const notification = buildNotificationTemplate(type, payload);
  return sendToUser(userId, notification);
};
