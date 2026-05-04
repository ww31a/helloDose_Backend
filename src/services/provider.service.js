import { Patient } from "../models/patient.model.js";
import { Provider } from "../models/provider.model.js";
import { Program } from "../models/program.model.js";
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
  // Get all patients assigned to this provider
  const patients = await Patient.find({ assignedProvider: providerUserId }).populate(
    "user",
    "firstName lastName email avatar"
  );

  const enrichedPatients = await Promise.all(
    patients.map(async (patient) => {
      const userId = patient.user._id;

      // Active Programs
      const activePrograms = await Program.find({ patient: userId, isActive: true });
      const mainProgram = activePrograms[0]; // Use first one for stats logic

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
      let programData = null;
      let healthInsights = null;

      if (mainProgram) {
        const currentWeightLoss =
          mainProgram.startWeight && latestWeight ? mainProgram.startWeight - latestWeight.weightLbs : 0;
        const progressPercent = mainProgram.targetWeightLoss
          ? Math.min(100, Math.round((currentWeightLoss / mainProgram.targetWeightLoss) * 100))
          : 0;

        let reorderStatus = "not_eligible";
        let nextRefillLabel = null;
        if (mainProgram.nextRefillDate) {
          const daysToRefill = Math.ceil(
            (mainProgram.nextRefillDate - new Date()) / (1000 * 60 * 60 * 24)
          );
          if (daysToRefill <= 0) {
            reorderStatus = "eligible_now";
            nextRefillLabel = "Reorder Eligible Now";
          } else {
            reorderStatus = `eligible_in_${daysToRefill}_days`;
            nextRefillLabel = `Eligible in ${daysToRefill} days`;
          }
        }

        programData = {
          name: mainProgram.name,
          startedAt: mainProgram.startedAt,
          targetWeightLoss: mainProgram.targetWeightLoss,
          currentWeightLoss: Math.round(currentWeightLoss * 10) / 10,
          progressPercent,
          monthsCompleted: Math.max(0, Math.floor((new Date() - mainProgram.startedAt) / (1000 * 60 * 60 * 24 * 30))),
          durationMonths: mainProgram.durationMonths || 8,
          lastReorderDate: mainProgram.lastReorderDate,
          reorderStatus,
          nextRefillLabel,
        };

        const totalLossPercent =
          mainProgram.startWeight && latestWeight
            ? Math.round(
                ((latestWeight.weightLbs - mainProgram.startWeight) / mainProgram.startWeight) * 100 * 10
              ) / 10
            : 0;

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
          currentDosage: mainProgram.currentDosage,
          lastInjectionAt: latestInjection?.injectedAt || null,
          nextRefillDate: mainProgram.nextRefillDate,
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
        program: programData,
        activePrograms: activePrograms.map(p => ({ name: p.name })),
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
  const patient = await Patient.findOne({
    user: patientUserId,
    assignedProvider: providerUserId,
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
  // Verify patient belongs to this provider
  const patient = await Patient.findOne({
    user: patientId,
    assignedProvider: providerUserId,
  });

  if (!patient) {
    throw new ApiError(404, "Patient not found or not assigned to you");
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

  // Enrich appointments with program info
  const enrichedAppointments = await Promise.all(
    futureAppointments.map(async (apt) => {
      const programs = await Program.find({ patient: apt.patient._id, isActive: true });
      return {
        _id: apt._id,
        patientName: `${apt.patient.firstName} ${apt.patient.lastName}`,
        patientId: apt.patient._id,
        startTime: apt.startTime,
        meetingLink: apt.meetingLink,
        status: apt.status,
        appointmentType: apt.appointmentType || "Follow-up",
        programNames: programs.length > 0 ? programs.map(p => p.name) : ["Tirzepatide"],
        programName: programs[0]?.name || "Tirzepatide", // Keep for backward compatibility if needed
      };
    })
  );

  const nextAppointment = enrichedAppointments[0] || null;
  const upcomingAppointments = enrichedAppointments.slice(1);

  // Active patients (basic count and list for search)
  const patientsCount = await Patient.countDocuments({ assignedProvider: providerUserId });

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

  const patientsCount = await Patient.countDocuments({ assignedProvider: providerUserId });

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
