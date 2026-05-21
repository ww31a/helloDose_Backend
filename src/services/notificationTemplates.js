export const NOTIFICATION_TYPES = {
  NEXT_REFILL_REMINDER: "NEXT_REFILL_REMINDER",
  UPCOMING_APPOINTMENT: "UPCOMING_APPOINTMENT",
  NP_CHECKIN_REQUEST: "NP_CHECKIN_REQUEST",
  SCHEDULE_CHECKIN_REMINDER: "SCHEDULE_CHECKIN_REMINDER",
  SCHEDULE_CHECKIN_OVERDUE: "SCHEDULE_CHECKIN_OVERDUE",
  INJECTION_TOMORROW: "INJECTION_TOMORROW",
  INJECTION_TODAY: "INJECTION_TODAY",
  INJECTION_MISSED: "INJECTION_MISSED",
  WEIGHT_LOG_REMINDER: "WEIGHT_LOG_REMINDER",
};

const defaultMedicationName = "medication";
const defaultProviderName = "your provider";

const getMedicationName = (payload) => payload.medicationName || defaultMedicationName;
const getProviderName = (payload) => payload.providerName || defaultProviderName;

const templates = {
  [NOTIFICATION_TYPES.NEXT_REFILL_REMINDER]: (payload) => ({
    title: "Time for a refill",
    body: `Your ${getMedicationName(payload)} supply is running low. Schedule a check-in now so you don't miss a dose.`,
    route: "ScheduleAppointment",
  }),

  [NOTIFICATION_TYPES.UPCOMING_APPOINTMENT]: (payload) => ({
    title: "Appointment coming up",
    body: `You have an appointment with ${getProviderName(payload)} on ${payload.date} at ${payload.time}. Tap to view details.`,
    route: "MyNP",
  }),

  [NOTIFICATION_TYPES.NP_CHECKIN_REQUEST]: (payload) => ({
    title: "Your provider wants to hear from you",
    body: `${getProviderName(payload)} has requested a quick check-in. Tap to complete it, it only takes a minute.`,
    route: "ScheduleAppointment",
  }),

  [NOTIFICATION_TYPES.SCHEDULE_CHECKIN_REMINDER]: () => ({
    title: "Don't forget to schedule your check-in",
    body: "You have a check-in to schedule. Pick a time that works for you so your care team stays in the loop.",
    route: "ScheduleAppointment",
  }),

  [NOTIFICATION_TYPES.SCHEDULE_CHECKIN_OVERDUE]: () => ({
    title: "Still need to check in",
    body: "Your recent check-in hasn't been completed yet. Schedule to help us support you better.",
    route: "ScheduleAppointment",
  }),

  [NOTIFICATION_TYPES.INJECTION_TOMORROW]: (payload) => ({
    title: "Injection tomorrow",
    body: `Your ${getMedicationName(payload)} injection is tomorrow. Make sure to hydrate and hit your protein goals.`,
    route: "LogInjection",
  }),

  [NOTIFICATION_TYPES.INJECTION_TODAY]: (payload) => ({
    title: "It's injection day 💉",
    body: `Time to take your ${getMedicationName(payload)}. Log it once you're done so we can help you keep on track.`,
    route: "LogInjection",
  }),

  [NOTIFICATION_TYPES.INJECTION_MISSED]: (payload) => ({
    title: "Did you take your injection yesterday?",
    body: `It looks like your ${getMedicationName(payload)} injection wasn't logged. Tap to log it now or let your care team know if you need help.`,
    route: "LogInjection",
  }),

  [NOTIFICATION_TYPES.WEIGHT_LOG_REMINDER]: () => ({
    title: "Quick weight log",
    body: "It's been 15 days since your last entry. A quick weight log helps your care team monitor your progress.",
    route: "UpdateWeight",
  }),
};

export const buildNotificationTemplate = (type, payload = {}) => {
  const template = templates[type];
  if (!template) {
    throw new Error(`Unsupported notification type: ${type}`);
  }

  const notification = template(payload);

  return {
    title: notification.title,
    body: notification.body,
    data: {
      type,
      route: notification.route,
      patientId: payload.patientId,
      providerId: payload.providerId,
      planId: payload.planId,
      appointmentId: payload.appointmentId,
      medicationName: payload.medicationName,
    },
  };
};
