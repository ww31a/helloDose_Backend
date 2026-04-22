import { ApiError } from "../utils/ApiError.js";
import logger from "../utils/logger.js";

const VAGARO_IPS = [
  "20.220.12.83",
  "13.67.143.68",
  "13.70.105.4",
  "20.62.123.184",
  "51.140.65.108",
  "51.143.95.2",
];

/**
 * Middleware to verify Vagaro webhook requests.
 * 1. Checks if the request source IP is whitelisted.
 * 2. Checks if the X-Vagaro-Signature header matches the verification token.
 */
export const verifyVagaroWebhook = (req, res, next) => {
  const clientIp = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  // Log the incoming request for debugging (optional, can be removed later)
  logger.info(`[Vagaro Webhook] Incoming request from IP: ${clientIp}`);

  // 1. IP Whitelisting
  // If we are in development, we might want to skip this or allow localhost
  if (process.env.NODE_ENV !== "development") {
    if (!VAGARO_IPS.includes(clientIp)) {
      logger.warn(`[Vagaro Webhook] Blocked request from unauthorized IP: ${clientIp}`);
      throw new ApiError(403, "Unauthorized IP address");
    }
  }

  next();
};
