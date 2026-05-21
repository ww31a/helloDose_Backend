import { Patient } from "../models/patient.model.js";
import { Provider } from "../models/provider.model.js";
import { Plan } from "../models/plan.model.js";
import { WeightLog } from "../models/weightLog.model.js";
import { InjectionLog } from "../models/injectionLog.model.js";
import { Appointment } from "../models/appointment.model.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import {
  getNextRefillDate,
  getDaysUntilNextRefill,
  getRefillEligibleLabel,
  getRefillSubLabel,
} from "../utils/refillDate.js";
import { NOTIFICATION_TYPES } from "./notificationTemplates.js";
import { sendNotificationTypeToUser } from "./notification.service.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const PROVIDER_TIMEZONE = "America/New_York";
const MS_PER_DAY = 1000 * 60 * 60 * 24;

const getRelativeDaysLabel = (daysAgo) => {
  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  return `${daysAgo} days ago`;
};

const enrichActivePlan = async (plan, userId, latestWeight) => {
  const injectionOr = [{ plan: plan._id }, { plan: { $exists: false }, medication: plan.name }];
  if (plan.currentDosage) {
    injectionOr.push({
      plan: { $exists: false },
      dosage: { $regex: new RegExp(plan.currentDosage, "i") },
    });
  }

  const latestInjection = await InjectionLog.findOne({
    patient: userId,
    $or: injectionOr,
  }).sort({ injectedAt: -1 });

  const hasWeightProgress =
    plan.startWeight !== undefined &&
    plan.startWeight !== null &&
    latestWeight?.weightLbs !== undefined &&
    latestWeight?.weightLbs !== null;

  const currentWeightLoss = hasWeightProgress
    ? Math.round((plan.startWeight - latestWeight.weightLbs) * 10) / 10
    : null;

  const progressPercent =
    plan.targetWeightLoss && currentWeightLoss !== null
      ? Math.min(100, Math.round((currentWeightLoss / plan.targetWeightLoss) * 100))
      : null;

  const totalLossPercent = hasWeightProgress
    ? Math.round(((latestWeight.weightLbs - plan.startWeight) / plan.startWeight) * 100 * 10) / 10
    : null;

  const computedNextRefillDate = getNextRefillDate(plan.startedAt);
  const daysUntilNextRefill = computedNextRefillDate
    ? getDaysUntilNextRefill(plan.startedAt)
    : null;

  let lastLoggedLabel = "Not logged";
  if (latestWeight) {
    const daysAgo = Math.floor((new Date() - latestWeight.loggedAt) / MS_PER_DAY);
    lastLoggedLabel = getRelativeDaysLabel(daysAgo);
  }

  let lastInjectionLabel = "No injections logged";
  if (latestInjection) {
    const daysSince = dayjs()
      .startOf("day")
      .diff(dayjs(latestInjection.injectedAt).startOf("day"), "day");
    if (daysSince === 0) lastInjectionLabel = "Last Injection: Today";
    else if (daysSince === 1) lastInjectionLabel = "Last Injection: Yesterday";
    else lastInjectionLabel = `Last Injection: ${daysSince} days ago`;
  }

  return {
    _id: plan._id,
    name: plan.name,
    type: plan.type,
    startedAt: plan.startedAt,
    targetWeightLoss: plan.targetWeightLoss,
    currentWeightLoss,
    progressPercent,
    currentDosage: plan.currentDosage,
    lastReorderDate: plan.lastReorderDate,
    nextRefillDate: computedNextRefillDate,
    nextRefillLabel: getRefillEligibleLabel(plan.startedAt),
    healthInsights: {
      lastLoggedWeight: latestWeight?.weightLbs ?? null,
      lastLoggedUnit: latestWeight?.unitLogged ?? null,
      lastLoggedLabel,
      totalLossPercent,
      currentDosage: plan.currentDosage,
      lastInjectionAt: latestInjection?.injectedAt ?? null,
      lastInjectionLabel,
      nextRefillDate: computedNextRefillDate,
      nextRefillLabel: getRefillSubLabel(plan.startedAt),
    },
  };
};

/**
 * Get all patients assigned to this provider — enriched with full card data
 */
export const getPatients = async (providerUserId) => {
  // Get all unique patients who have at least one active plan assigned to this provider
  const plansWithProvider = await Plan.find({ assignedProvider: providerUserId });
  const patientUserIds = [...new Set(plansWithProvider.map((p) => p.patient))];

  const patients = await Patient.find({ user: { $in: patientUserIds } }).populate(
    "user",
    "firstName lastName email avatar"
  );

  const enrichedPatients = await Promise.all(
    patients.map(async (patient) => {
      const userId = patient.user._id;

      const activePlans = await Plan.find({ patient: userId, isActive: true });
      const latestWeight = await WeightLog.findOne({ patient: userId }).sort({ loggedAt: -1 });

      const enrichedActivePlans = await Promise.all(
        activePlans.map((plan) => enrichActivePlan(plan, userId, latestWeight))
      );

      const mainPlanIndex = activePlans.findIndex(
        (p) => p.assignedProvider?.toString() === providerUserId.toString()
      );
      const mainEnrichedPlan = enrichedActivePlans[mainPlanIndex >= 0 ? mainPlanIndex : 0] || null;

      const nextAppointment = await Appointment.findOne({
        patient: userId,
        provider: providerUserId,
        status: "scheduled",
        startTime: { $gt: new Date() },
      }).sort({ startTime: 1 });

      let planData = null;
      let healthInsights = null;

      if (mainEnrichedPlan) {
        const mainPlan = activePlans[mainPlanIndex >= 0 ? mainPlanIndex : 0] || activePlans[0];
        const daysUntilNextRefill = mainEnrichedPlan.nextRefillDate
          ? getDaysUntilNextRefill(mainPlan.startedAt)
          : null;

        planData = {
          name: mainEnrichedPlan.name,
          startedAt: mainEnrichedPlan.startedAt,
          targetWeightLoss: mainEnrichedPlan.targetWeightLoss,
          currentWeightLoss: mainEnrichedPlan.currentWeightLoss,
          progressPercent: mainEnrichedPlan.progressPercent,
          monthsCompleted: Math.max(
            0,
            Math.floor((new Date() - mainPlan.startedAt) / (MS_PER_DAY * 30))
          ),
          durationMonths: mainPlan.durationMonths,
          lastReorderDate: mainEnrichedPlan.lastReorderDate,
          nextRefillDate: mainEnrichedPlan.nextRefillDate,
          reorderStatus:
            daysUntilNextRefill === null
              ? null
              : daysUntilNextRefill <= 0
                ? "eligible_now"
                : `eligible_in_${daysUntilNextRefill}_days`,
          nextRefillLabel: mainEnrichedPlan.nextRefillLabel,
        };

        healthInsights = {
          ...mainEnrichedPlan.healthInsights,
          lastLoggedAt: latestWeight?.loggedAt || null,
        };
      }

      let appointmentData = null;
      if (nextAppointment) {
        const daysUntil = Math.max(
          0,
          Math.ceil((nextAppointment.startTime - new Date()) / (1000 * 60 * 60 * 24))
        );
        appointmentData = {
          startTime: nextAppointment.startTime,
          daysUntil,
          status: nextAppointment.status,
          label: daysUntil === 0 ? "Today" : `In ${daysUntil} days`,
        };
      }

      return {
        patient: {
          _id: patient.user._id,
          firstName: patient.user.firstName,
          lastName: patient.user.lastName,
          email: patient.user.email,
          avatar: patient.user.avatar,
          age: patient.age,
          gender: patient.gender,
        },
        plan: planData,
        activePlans: enrichedActivePlans,
        healthInsights,
        nextAppointment: appointmentData,
      };
    })
  );

  return enrichedPatients;
};

/**
 * Get single patient full profile (provider must own the patient)
 */
export const getPatientDetail = async (providerUserId, patientUserId) => {
  const plans = await Plan.find({ patient: patientUserId, assignedProvider: providerUserId });

  if (plans.length === 0) {
    throw new ApiError(404, "Patient not found or not assigned to you for any plan");
  }

  const patient = await Patient.findOne({
    user: patientUserId,
  }).populate("user", "firstName lastName email avatar");

  if (!patient) {
    throw new ApiError(404, "Patient not found or not assigned to you");
  }

  // Reuse the same enrichment logic — get the single patient with full data
  const patients = await getPatients(providerUserId);
  const detail = patients.find((p) => p.patient._id.toString() === patientUserId);

  if (!detail) {
    throw new ApiError(404, "Patient not found");
  }

  // Add weight and injection history for detail view
  const weightHistory = await WeightLog.find({ patient: patientUserId })
    .sort({ loggedAt: -1 })
    .limit(30);
  const injectionHistory = await InjectionLog.find({ patient: patientUserId })
    .sort({ injectedAt: -1 })
    .limit(30);

  return {
    ...detail,
    weightHistory,
    injectionHistory,
  };
};

/**
 * Request check-in — send push notification to patient
 */
export const requestCheckin = async (providerUserId, patientId) => {
  // Verify patient belongs to this provider via at least one plan
  const plan = await Plan.findOne({
    patient: patientId,
    assignedProvider: providerUserId,
  });

  if (!plan) {
    throw new ApiError(404, "Patient not found or not assigned to you for any plan");
  }

  const patientUser = await User.findById(patientId);
  if (!patientUser) {
    throw new ApiError(404, "Patient user not found");
  }

  const providerUser = await User.findById(providerUserId).select("firstName lastName");

  // Set checkinRequested to true
  await Patient.findOneAndUpdate({ user: patientId }, { checkinRequested: true });

  try {
    await sendNotificationTypeToUser(patientId, NOTIFICATION_TYPES.NP_CHECKIN_REQUEST, {
      patientId,
      providerId: providerUserId,
      providerName: providerUser
        ? `${providerUser.firstName} ${providerUser.lastName}`
        : "Your provider",
    });
  } catch (error) {
    console.error("Failed to send check-in push notification:", error.message);
  }

  return null;
};

/**
 * Get Provider Dashboard summary
 */
export const getDashboard = async (providerUserId) => {
  const provider = await User.findById(providerUserId).select("firstName lastName avatar");
  if (!provider) throw new ApiError(404, "Provider not found");

  const now = dayjs().tz(PROVIDER_TIMEZONE);

  // Find all future appointments
  const futureAppointments = await Appointment.find({
    provider: providerUserId,
    startTime: { $gte: now.toDate() },
    status: "scheduled",
  })
    .sort({ startTime: 1 })
    .populate("patient", "firstName lastName avatar");

  // Enrich appointments with plan info
  const enrichedAppointments = await Promise.all(
    futureAppointments.map(async (apt) => {
      const plans = await Plan.find({ patient: apt.patient._id, isActive: true });
      return {
        _id: apt._id,
        patientName: `${apt.patient.firstName} ${apt.patient.lastName}`,
        patientId: apt.patient._id,
        startTime: apt.startTime,
        meetingLink: apt.meetingLink,
        status: apt.status,
        appointmentType: apt.appointmentType || "Follow-up",
        planNames: plans.map((p) => p.name),
        planName: plans[0]?.name || null,
      };
    })
  );

  const nextAppointment = enrichedAppointments[0] || null;
  const upcomingAppointments = enrichedAppointments.slice(1);

  // Active patients (basic count)
  const plansWithProvider = await Plan.find({ assignedProvider: providerUserId });
  const patientUserIds = [...new Set(plansWithProvider.map((p) => p.patient.toString()))];
  const patientsCount = patientUserIds.length;

  return {
    providerName: provider.firstName,
    nextAppointment,
    upcomingAppointments,
    activePatientsCount: patientsCount,
  };
};

/**
 * Get Provider Profile data
 */
export const getProfile = async (providerUserId) => {
  const provider = await Provider.findOne({ user: providerUserId }).populate(
    "user",
    "firstName lastName email avatar"
  );
  if (!provider) throw new ApiError(404, "Provider not found");

  const plansWithProvider = await Plan.find({ assignedProvider: providerUserId });
  const patientUserIds = [...new Set(plansWithProvider.map((p) => p.patient.toString()))];
  const patientsCount = patientUserIds.length;

  // Calculate "On Shift" status
  let isCurrentlyOnShift = false;
  let availabilityLabel = "No shift scheduled today";

  try {
    const calcomService = await import("./calcom.service.js");
    const scheduleId = provider.calcom_schedule_id;
    const schedule = scheduleId ? await calcomService.getSchedule(scheduleId) : null;

    if (schedule && schedule.availability) {
      const scheduleTimeZone = schedule.timeZone || PROVIDER_TIMEZONE;
      const now = dayjs().tz(scheduleTimeZone);
      const todayDay = now.format("dddd"); // e.g. "Monday"
      const todayDate = now.format("YYYY-MM-DD");

      const todayAvailability = schedule.availability
        .filter((a) => a.days?.some((day) => day.toLowerCase() === todayDay.toLowerCase()))
        .map((avail) => {
          const start = dayjs.tz(`${todayDate}T${avail.startTime}`, scheduleTimeZone);
          let end = dayjs.tz(`${todayDate}T${avail.endTime}`, scheduleTimeZone);
          if (end.isBefore(start)) end = end.add(1, "day");
          return { start, end };
        })
        .sort((a, b) => a.start.valueOf() - b.start.valueOf());

      for (const avail of todayAvailability) {
        const startTimeLabel = avail.start.format("h:mm A");
        const endTimeLabel = avail.end.format("h:mm A");

        if (now.isBefore(avail.start)) {
          availabilityLabel = `Starts at ${startTimeLabel} today`;
          break;
        }

        if (now.isSame(avail.start) || (now.isAfter(avail.start) && now.isBefore(avail.end))) {
          isCurrentlyOnShift = true;
          availabilityLabel = `Ends at ${endTimeLabel} today`;
          break;
        }

        availabilityLabel = `Shift ended at ${endTimeLabel} today`;
      }
    }
  } catch (error) {
    console.warn("Could not fetch live shift status from Cal.com:", error.message);
  }

  return {
    firstName: provider.user.firstName,
    lastName: provider.user.lastName,
    title: provider.title,
    npi: provider.npi,
    avatar: provider.user.avatar,
    email: provider.user.email,
    activePatientsCount: patientsCount,
    availabilityStatus: isCurrentlyOnShift ? "Currently On Shift" : "Off Duty",
    availabilityLabel,
  };
};

/**
 * Get Provider's Live Availability from Cal.com
 */
export const getAvailability = async (providerUserId) => {
  const provider = await Provider.findOne({ user: providerUserId });
  if (!provider) throw new ApiError(404, "Provider not found");

  try {
    const calcomService = await import("./calcom.service.js");
    const scheduleId = provider.calcom_schedule_id;
    const schedule = scheduleId ? await calcomService.getSchedule(scheduleId) : null;

    // Map Cal.com ["Monday", "Tuesday"] back to our UI format
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const mapped = {};

    days.forEach((day) => {
      const avail = schedule?.availability?.find((a) => a.days.includes(day));
      mapped[day.toLowerCase()] = {
        enabled: !!avail,
        slots: avail ? [{ start: avail.startTime, end: avail.endTime }] : [],
      };
    });

    return mapped;
  } catch (error) {
    return provider.availability;
  }
};

/**
 * Update Provider Availability on Cal.com
 */
export const updateAvailability = async (providerUserId, availabilityData) => {
  const provider = await Provider.findOne({ user: providerUserId });
  if (!provider) throw new ApiError(404, "Provider not found");

  const calcomService = await import("./calcom.service.js");
  const scheduleId = provider.calcom_schedule_id || 1433216; // Safety default for Sarah

  // Step 1: Fetch existing schedule to get name/timeZone (Cal.com v2 often requires these in PATCH)
  let existingSchedule;
  try {
    existingSchedule = await calcomService.getSchedule(scheduleId);
  } catch (err) {
    console.warn("Could not fetch existing schedule, proceeding with partial update");
  }

  // Map our UI format to Cal.com array
  const calcomAvailability = [];
  for (const [day, data] of Object.entries(availabilityData)) {
    if (data.enabled && data.slots && data.slots.length > 0) {
      const capitalizedDay = day.charAt(0).toUpperCase() + day.slice(1);
      data.slots.forEach((slot) => {
        calcomAvailability.push({
          days: [capitalizedDay],
          startTime: slot.start,
          endTime: slot.end,
        });
      });
    }
  }

  // Step 2: Push to Cal.com with preserved fields
  await calcomService.updateSchedule(scheduleId, {
    name: existingSchedule?.name || "Member Schedule",
    timeZone: existingSchedule?.timeZone || PROVIDER_TIMEZONE,
    isDefault: existingSchedule?.isDefault ?? true,
    availability: calcomAvailability,
  });

  // Step 3: Also sync locally
  provider.availability = Object.entries(availabilityData).map(([day, data]) => ({
    day,
    enabled: data.enabled,
    slots: data.slots,
  }));
  await provider.save();

  return true;
};
