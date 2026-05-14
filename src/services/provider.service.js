import { Patient } from "../models/patient.model.js";
import { Provider } from "../models/provider.model.js";
import { Plan } from "../models/plan.model.js";
import { WeightLog } from "../models/weightLog.model.js";
import { InjectionLog } from "../models/injectionLog.model.js";
import { Appointment } from "../models/appointment.model.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const PROVIDER_TIMEZONE = "America/New_York";

/**
 * Get all patients assigned to this provider — enriched with full card data
 */
export const getPatients = async (providerUserId) => {
  // Get all unique patients who have at least one active plan assigned to this provider
  const plansWithProvider = await Plan.find({ assignedProvider: providerUserId });
  const patientUserIds = [...new Set(plansWithProvider.map(p => p.patient))];

  const patients = await Patient.find({ user: { $in: patientUserIds } }).populate(
    "user",
    "firstName lastName email avatar"
  );

  const enrichedPatients = await Promise.all(
    patients.map(async (patient) => {
      const userId = patient.user._id;

      // Active Plans
      const activePlans = await Plan.find({ patient: userId, isActive: true });
      const mainPlan = activePlans.find(p => p.assignedProvider?.toString() === providerUserId.toString()) || activePlans[0]; // Prefer the plan assigned to this provider

      // Latest weight
      const latestWeight = await WeightLog.findOne({ patient: userId }).sort({ loggedAt: -1 });

      // Latest injection
      const latestInjection = await InjectionLog.findOne({ patient: userId }).sort({ injectedAt: -1 });

      // Next appointment
      const nextAppointment = await Appointment.findOne({
        patient: userId,
        provider: providerUserId,
        status: "scheduled",
        startTime: { $gt: new Date() },
      }).sort({ startTime: 1 });

      // Compute derived fields
      let planData = null;
      let healthInsights = null;

      if (mainPlan) {
        const hasWeightProgress = mainPlan.startWeight !== undefined
          && mainPlan.startWeight !== null
          && latestWeight?.weightLbs !== undefined
          && latestWeight?.weightLbs !== null;
        const currentWeightLoss = hasWeightProgress ? mainPlan.startWeight - latestWeight.weightLbs : null;
        const progressPercent = mainPlan.targetWeightLoss && currentWeightLoss !== null
          ? Math.min(100, Math.round((currentWeightLoss / mainPlan.targetWeightLoss) * 100))
          : null;

        let reorderStatus = null;
        let nextRefillLabel = null;
        if (mainPlan.nextRefillDate) {
          const daysToRefill = Math.ceil(
            (mainPlan.nextRefillDate - new Date()) / (1000 * 60 * 60 * 24)
          );
          if (daysToRefill <= 0) {
            reorderStatus = "eligible_now";
            nextRefillLabel = "Reorder Eligible Now";
          } else {
            reorderStatus = `eligible_in_${daysToRefill}_days`;
            nextRefillLabel = `Eligible in ${daysToRefill} days`;
          }
        }

        planData = {
          name: mainPlan.name,
          startedAt: mainPlan.startedAt,
          targetWeightLoss: mainPlan.targetWeightLoss,
          currentWeightLoss: currentWeightLoss !== null ? Math.round(currentWeightLoss * 10) / 10 : null,
          progressPercent,
          monthsCompleted: Math.max(0, Math.floor((new Date() - mainPlan.startedAt) / (1000 * 60 * 60 * 24 * 30))),
          durationMonths: mainPlan.durationMonths,
          lastReorderDate: mainPlan.lastReorderDate,
          reorderStatus,
          nextRefillLabel,
        };

        const totalLossPercent =
          hasWeightProgress
            ? Math.round(
                ((latestWeight.weightLbs - mainPlan.startWeight) / mainPlan.startWeight) * 100 * 10
              ) / 10
            : null;

        // Relative time for weight
        let lastLoggedLabel = "Never";
        if (latestWeight) {
          const daysAgo = Math.floor((new Date() - latestWeight.loggedAt) / (1000 * 60 * 60 * 24));
          if (daysAgo === 0) lastLoggedLabel = "Today";
          else if (daysAgo === 1) lastLoggedLabel = "Yesterday";
          else lastLoggedLabel = `${daysAgo} days ago`;
        }

        healthInsights = {
          lastLoggedWeight: latestWeight?.weightLbs || null,
          lastLoggedUnit: latestWeight?.unitLogged || null,
          lastLoggedAt: latestWeight?.loggedAt || null,
          lastLoggedLabel,
          totalLossPercent,
          currentDosage: mainPlan.currentDosage,
          lastInjectionAt: latestInjection?.injectedAt || null,
          nextRefillDate: mainPlan.nextRefillDate,
        };
      }

      let appointmentData = null;
      if (nextAppointment) {
        const daysUntil = Math.max(0, Math.ceil((nextAppointment.startTime - new Date()) / (1000 * 60 * 60 * 24)));
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
        activePlans: activePlans.map(p => ({
          _id: p._id,
          name: p.name,
          type: p.type,
          startedAt: p.startedAt,
          targetWeightLoss: p.targetWeightLoss,
          currentDosage: p.currentDosage,
          nextRefillDate: p.nextRefillDate,
          lastReorderDate: p.lastReorderDate,
        })),
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

  // TODO: Send push notification via Firebase when configured
  // For MVP, log the action
  if (patientUser.deviceToken) {
    console.log(
      `[Check-in Request] Push notification would be sent to device token: ${patientUser.deviceToken}`
    );
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
        planNames: plans.map(p => p.name),
        planName: plans[0]?.name || null,
      };
    })
  );

  const nextAppointment = enrichedAppointments[0] || null;
  const upcomingAppointments = enrichedAppointments.slice(1);

  // Active patients (basic count)
  const plansWithProvider = await Plan.find({ assignedProvider: providerUserId });
  const patientUserIds = [...new Set(plansWithProvider.map(p => p.patient.toString()))];
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
  const patientUserIds = [...new Set(plansWithProvider.map(p => p.patient.toString()))];
  const patientsCount = patientUserIds.length;

  // Calculate "On Shift" status
  let isCurrentlyOnShift = false;
  let shiftEndsLabel = "";

  try {
    const calcomService = await import("./calcom.service.js");
    const schedule = await calcomService.getSchedule(provider.calcom_schedule_id);

    if (schedule && schedule.availability) {
      const todayDay = dayjs().format("dddd"); // e.g. "Monday"
      const nowTime = dayjs().format("HH:mm");

      const todayAvailability = schedule.availability.filter((a) => a.days.includes(todayDay));

      for (const avail of todayAvailability) {
        if (nowTime >= avail.startTime && nowTime <= avail.endTime) {
          isCurrentlyOnShift = true;
          const endTimeLabel = dayjs(`2000-01-01T${avail.endTime}`).format("h:mm A");
          shiftEndsLabel = `Ends at ${endTimeLabel} today`;
          break;
        }
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
    availabilityLabel: isCurrentlyOnShift ? shiftEndsLabel : "No shift scheduled today",
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
    const schedule = await calcomService.getSchedule(provider.calcom_schedule_id);

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
