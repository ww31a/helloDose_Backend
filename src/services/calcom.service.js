import axios from "axios";
import { ApiError } from "../utils/ApiError.js";
import logger from "../utils/logger.js";

/**
 * Cal.com Service (v2)
 *
 * Mental model: Cal.com = video session link only.
 * One platform API key. NPs routed by calcom_username + calcom_event_type_slug.
 * Cal.com is called in exactly two places:
 *   1. getAvailableSlots() — patient fetches NP's open times
 *   2. generateMeetingLink() — patient starts consultation
 */

const CALCOM_BASE_URL = "https://api.cal.com/v2";
const CALCOM_API_VERSION = "2024-08-13";

// One shared client — platform API key, used for all NPs
const calcom = axios.create({
  baseURL: CALCOM_BASE_URL,
  headers: {
    Authorization: `Bearer ${process.env.CALCOM_API_KEY}`,
    "Content-Type": "application/json",
    "cal-api-version": CALCOM_API_VERSION,
  },
  timeout: 10000,
});

/**
 * Fetch available slots for a specific NP.
 * username + eventTypeSlug are the routing keys — no numeric IDs.
 */
export const getAvailableSlots = async ({
  username,
  eventTypeSlug,
  startTime,
  endTime,
  timeZone = "America/New_York",
}) => {
  try {
    const { data } = await calcom.get("/slots", {
      params: { username, eventTypeSlug, startTime, endTime, timeZone },
    });
    // Returns slots grouped by date: { "2026-04-20": [{ time: "..." }, ...] }
    return data.data?.slots ?? {};
  } catch (err) {
    logger.error(`Cal.com getAvailableSlots error: ${err.message}`);
    throw new ApiError(502, "Failed to fetch availability from Cal.com");
  }
};

/**
 * Generate a meeting link by creating a booking on the NP's calendar.
 * Link is cached on the Appointment document by the controller — never call this twice.
 */
export const generateMeetingLink = async ({
  provider,
  appointment,
  patientName,
  patientEmail,
}) => {
  if (!provider.calcom_username || !provider.calcom_event_type_slug) {
    throw new ApiError(
      500,
      `Provider ${provider._id} is missing Cal.com configuration (calcom_username or calcom_event_type_slug)`
    );
  }

  try {
    const { data } = await calcom.post("/bookings", {
      username: provider.calcom_username,
      eventTypeSlug: provider.calcom_event_type_slug,
      start: appointment.startTime,
      attendee: {
        name: patientName,
        email: patientEmail,
        timeZone: "America/New_York",
      },
      metadata: { appointmentId: appointment._id.toString() },
    });

    return {
      meetingLink: data.data?.videoCallData?.url ?? data.data?.meetingUrl ?? null,
      cal_booking_id: data.data?.uid,
    };
  } catch (err) {
    logger.error(`Cal.com generateMeetingLink error (provider ${provider._id}): ${err.message}`);
    throw new ApiError(502, "Failed to generate meeting link from Cal.com");
  }
};

/**
 * Process Cal.com webhook events.
 * BOOKING_CREATED is a no-op — Vagaro owns appointment creation.
 */
export const processCalcomWebhook = async (event) => {
  const { Appointment } = await import("../models/appointment.model.js");

  const triggerEvent = event.triggerEvent;
  const payload = event.payload || event.data;

  switch (triggerEvent) {
    case "BOOKING_CREATED":
      logger.info(`[Cal.com] BOOKING_CREATED received — no-op (Vagaro owns bookings)`);
      return;

    case "BOOKING_RESCHEDULED": {
      const bookingId = payload?.uid ?? payload?.id;
      const appt = await Appointment.findOne({ cal_booking_id: bookingId });
      if (!appt) {
        logger.warn(`[Cal.com] BOOKING_RESCHEDULED — no appointment found for cal_booking_id ${bookingId}`);
        return;
      }
      appt.startTime = payload.start ?? payload.startTime;
      appt.endTime = payload.end ?? payload.endTime;
      appt.status = "rescheduled";
      await appt.save();
      logger.info(`[Cal.com] Appointment rescheduled: ${appt._id}`);
      return;
    }

    case "BOOKING_CANCELLED": {
      const bookingId = payload?.uid ?? payload?.id;
      const appt = await Appointment.findOne({ cal_booking_id: bookingId });
      if (!appt) {
        logger.warn(`[Cal.com] BOOKING_CANCELLED — no appointment found for cal_booking_id ${bookingId}`);
        return;
      }
      appt.status = "cancelled";
      await appt.save();
      logger.info(`[Cal.com] Appointment cancelled: ${appt._id}`);
      return;
    }

    default:
      logger.warn(`[Cal.com] Unhandled webhook event: ${triggerEvent}`);
  }
};
