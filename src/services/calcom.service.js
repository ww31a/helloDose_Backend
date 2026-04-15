import axios from "axios";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Cal.com Service (v2)
 */

const calcomClient = axios.create({
  baseURL: process.env.CALCOM_BASE_URL || "https://api.cal.com/v2",
  headers: {
    "Content-Type": "application/json",
    "cal-api-version": process.env.CALCOM_API_VERSION || "2024-09-04",
  },
  timeout: 10000,
});

// Add API key to all requests
calcomClient.interceptors.request.use((config) => {
  const apiKey = process.env.CALCOM_API_KEY;
  if (apiKey) {
    config.headers.Authorization = `Bearer ${apiKey}`;
  }
  return config;
});

/**
 * Fetch available time slots (v2)
 */
export const getAvailableSlots = async ({
  eventTypeId,
  eventTypeSlug,
  username,
  date,
  days = 30, // Support fetching a broader range for the calendar view
  timeZone = "America/New_York",
}) => {
  try {
    const startTime = dayjs.tz(date, timeZone).startOf("day").format("YYYY-MM-DD");
    const endTime = dayjs.tz(date, timeZone).add(days, "day").format("YYYY-MM-DD");

    const params = {
      start: startTime,
      end: endTime,
      timeZone,
    };

    if (eventTypeId) {
      params.eventTypeId = eventTypeId;
    } else if (eventTypeSlug && username) {
      params.eventTypeSlug = eventTypeSlug;
      params.username = username;
    } else {
      throw new Error(`Missing identification: Slug[${eventTypeSlug}] User[${username}]`);
    }

    const response = await calcomClient.get("slots", { params });

    // Extract all dates from the response
    const rawSlotsData = response.data?.data || {};
    
    // Format the response into a mapping: { "YYYY-MM-DD": [ { time, isoTime }, ... ] }
    const availabilityMap = {};
    Object.keys(rawSlotsData).forEach((dKey) => {
      availabilityMap[dKey] = (rawSlotsData[dKey] || []).map((slot) => ({
        time: dayjs(slot.start || slot.time).tz(timeZone).format("h:mm A"),
        isoTime: slot.start || slot.time,
      }));
    });

    // If only one day was requested, return it in the old format to keep SelectTimeSlot working
    if (days === 1 || days === "1") {
      const dateKey = dayjs.tz(date, timeZone).format("YYYY-MM-DD");
      return { slots: availabilityMap[dateKey] || [] };
    }

    return availabilityMap;
  } catch (error) {
    if (error.response) {
      console.error(`[Cal.com Error] Status: ${error.response.status}`);
      console.error(`[Cal.com Error] Data:`, JSON.stringify(error.response.data, null, 2));
    }
    throw new Error(`Failed to fetch slots from Cal.com: ${error.message}`);
  }
};

/**
 * Create a booking (v2)
 */
export const createBooking = async ({
  eventTypeId,
  eventTypeSlug,
  username,
  startTime,
  name,
  email,
  patientId,
  providerId,
  timeZone = "America/New_York",
}) => {
  try {
    const payload = {
      start: startTime,
      attendee: {
        name,
        email,
        timeZone,
      },
      metadata: {
        patientId,
        providerId,
      },
    };

    if (eventTypeId) {
      payload.eventTypeId = eventTypeId;
    } else if (eventTypeSlug && username) {
      payload.eventTypeSlug = eventTypeSlug;
      payload.username = username;
    }

    const response = await calcomClient.post("bookings", payload, {
      headers: {
        "cal-api-version": "2024-08-13",
      },
    });

    const booking = response.data?.data;

    return {
      calBookingId: booking?.id?.toString() || booking?.uid,
      startTime: booking?.start,
      endTime: booking?.end,
      meetingLink: booking?.meetingUrl || booking?.location || booking?.metadata?.videoCallUrl || "",
      status: "scheduled",
    };
  } catch (error) {
    if (error.response) {
      console.error(`[Cal.com Error] Status: ${error.response.status}`);
      console.error(`[Cal.com Error] Data:`, JSON.stringify(error.response.data, null, 2));
    }
    throw new Error(`Failed to create booking on Cal.com: ${error.message}`);
  }
};

/**
 * Cancel a booking (v2)
 */
export const cancelBooking = async (calBookingId, reason = "Cancelled by user") => {
  try {
    await calcomClient.post(`bookings/${calBookingId}/cancel`, {
      cancellationReason: reason,
    }, {
      headers: {
        "cal-api-version": "2024-08-13",
      },
    });
    return true;
  } catch (error) {
    if (error.response) {
      console.error(`[Cal.com Error] Status: ${error.response.status}`);
      console.error(`[Cal.com Error] Data:`, JSON.stringify(error.response.data, null, 2));
    }
    throw new Error(`Failed to cancel booking on Cal.com: ${error.message}`);
  }
};

/**
 * Get a specific schedule (v2)
 */
export const getSchedule = async (scheduleId) => {
  try {
    const response = await calcomClient.get(`schedules/${scheduleId}`, {
      headers: {
        "cal-api-version": "2024-06-11",
      },
    });
    return response.data?.data;
  } catch (error) {
    if (error.response) {
      console.error(`[Cal.com Error] Status: ${error.response.status}`);
      console.error(`[Cal.com Error] Data:`, JSON.stringify(error.response.data, null, 2));
    }
    throw new Error(`Failed to fetch schedule from Cal.com: ${error.message}`);
  }
};

/**
 * Update a schedule (v2)
 */
export const updateSchedule = async (scheduleId, data) => {
  try {
    const headers = {
      "cal-api-version": "2024-06-11",
    };
    
    console.log(`[DEBUG] Updating Cal.com Schedule ${scheduleId}`);
    console.log(`[DEBUG] Headers:`, JSON.stringify(headers, null, 2));
    console.log(`[DEBUG] Payload:`, JSON.stringify(data, null, 2));

    const response = await calcomClient.patch(`schedules/${scheduleId}`, data, {
      headers,
    });
    return response.data?.data;
  } catch (error) {
    if (error.response) {
      console.error(`[Cal.com Error] Status: ${error.response.status}`);
      console.error(`[Cal.com Error] Payload Sent:`, JSON.stringify(data, null, 2));
      console.error(`[Cal.com Error] Data Received:`, JSON.stringify(error.response.data, null, 2));
    }
    throw new Error(`Failed to update schedule on Cal.com: ${error.message}`);
  }
};

/**
 * Process Cal.com webhook events (v2)
 */
export const processWebhookEvent = async (event) => {
  const { Appointment } = await import("../models/appointment.model.js");

  const triggerEvent = event.triggerEvent;
  const payload = event.payload || event.data;

  switch (triggerEvent) {
    case "BOOKING_CREATED": {
      const existing = await Appointment.findOne({ calBookingId: payload.uid || payload.id });
      return existing;
    }

    case "BOOKING_RESCHEDULED": {
      const appointment = await Appointment.findOne({ calBookingId: payload.uid || payload.id });
      if (appointment) {
        appointment.startTime = payload.start || payload.startTime;
        appointment.endTime = payload.end || payload.endTime;
        appointment.status = "rescheduled";
        await appointment.save();
      }
      return appointment;
    }

    case "BOOKING_CANCELLED": {
      const appointment = await Appointment.findOne({ calBookingId: payload.uid || payload.id });
      if (appointment) {
        appointment.status = "cancelled";
        await appointment.save();
      }
      return appointment;
    }

    default:
      console.log(`Unhandled Cal.com webhook event: ${triggerEvent}`);
      return null;
  }
};
