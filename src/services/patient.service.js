import { Patient } from "../models/patient.model.js";
import { Program } from "../models/program.model.js";
import { WeightLog } from "../models/weightLog.model.js";
import { InjectionLog } from "../models/injectionLog.model.js";
import { Appointment } from "../models/appointment.model.js";
import { Provider } from "../models/provider.model.js";
import { ApiError } from "../utils/ApiError.js";
import { LBS_PER_KG } from "../constants.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Get patient dashboard — single aggregated response
 */
export const getDashboard = async (userId) => {
  const patient = await Patient.findOne({ user: userId }).populate("user", "firstName lastName email avatar");
  if (!patient) throw new ApiError(404, "Patient profile not found");

  // Find all active programs
  const activePrograms = await Program.find({ patient: userId, isActive: true });

  // Latest weight log (used for weight loss calculations)
  const latestWeight = await WeightLog.findOne({ patient: userId }).sort({ loggedAt: -1 });

  // Latest injection log (for general insights if needed, but we'll calculate per-program if we assume injections are linked to programs)
  // For now, let's assume injection logs are generic but we might want to filter them by medication in the future.
  // To keep it simple and matching the UI, we'll get the latest injection log.

  const programsData = await Promise.all(activePrograms.map(async (program) => {
    // Latest injection for THIS medication
    const latestProgramInjection = await InjectionLog.findOne({ 
      patient: userId,
      $or: [
        { medication: program.medication },
        // Fallback for old logs without medication field
        { dosage: { $regex: new RegExp(program.currentDosage, 'i') } }
      ]
    }).sort({ injectedAt: -1 });

    // Fallback to absolute latest injection if no specific one found
    const latestInjection = latestProgramInjection || await InjectionLog.findOne({ patient: userId }).sort({ injectedAt: -1 });

    const currentWeightLoss = program.startWeight && latestWeight
      ? program.startWeight - latestWeight.weightLbs
      : 0;
    const progressPercent = program.targetWeightLoss
      ? Math.min(100, Math.round((currentWeightLoss / program.targetWeightLoss) * 100))
      : 0;

    // Reorder status
    let reorderStatus = "not_eligible";
    if (program.nextRefillDate) {
      const daysToRefill = Math.ceil((program.nextRefillDate - new Date()) / (1000 * 60 * 60 * 24));
      if (daysToRefill <= 0) reorderStatus = "eligible_now";
      else if (daysToRefill <= 21) reorderStatus = "eligible_in_3_weeks";
    }

    const monthsCompleted = Math.max(0, Math.floor((new Date() - program.startedAt) / (1000 * 60 * 60 * 24 * 30)));

    const details = {
      _id: program._id,
      name: program.name,
      medication: program.medication,
      type: program.type || "weight-loss",
      startedAt: program.startedAt,
      targetWeightLoss: program.targetWeightLoss,
      currentWeightLoss: Math.round(currentWeightLoss * 10) / 10,
      progressPercent,
      monthsCompleted,
      durationMonths: program.durationMonths || 8,
      lastReorderDate: program.lastReorderDate,
      eligibleToReorderAt: program.nextRefillDate,
      reorderStatus,
    };

    // Health insights for this specific program
    const totalLossPercent = program.startWeight && latestWeight
      ? Math.round(((latestWeight.weightLbs - program.startWeight) / program.startWeight) * 100 * 10) / 10
      : 0;

    const firstWeightLog = await WeightLog.findOne({
      patient: userId,
      loggedAt: { $gte: program.startedAt },
    }).sort({ loggedAt: 1 });

    const INJECTION_FREQUENCY_DAYS = 7;
    let daysSinceLastInjection = null;
    let nextInjectionDate = null;
    let daysUntilNextInjection = null;

    if (latestInjection) {
      daysSinceLastInjection = Math.floor((new Date() - latestInjection.injectedAt) / (1000 * 60 * 60 * 24));
      nextInjectionDate = new Date(latestInjection.injectedAt);
      nextInjectionDate.setDate(nextInjectionDate.getDate() + INJECTION_FREQUENCY_DAYS);
      daysUntilNextInjection = Math.max(0, Math.ceil((nextInjectionDate - new Date()) / (1000 * 60 * 60 * 24)));
    }

    const insights = {
      currentDosage: program.currentDosage,
      lastInjectionAt: latestInjection?.injectedAt || null,
      daysSinceLastInjection,
      nextInjectionDate,
      daysUntilNextInjection,
      nextInjectionLabel: daysUntilNextInjection !== null 
        ? (daysUntilNextInjection === 0 ? "Today" : `${daysUntilNextInjection} days`)
        : null,
      nextRefillDate: program.nextRefillDate,
      nextRefillLabel: program.nextRefillDate
        ? `In ${Math.max(0, Math.ceil((program.nextRefillDate - new Date()) / (1000 * 60 * 60 * 24 * 7)))} weeks`
        : null,
    };

    return {
      ...details,
      healthInsights: insights,
    };
  }));

  // General health insights (latest weight info)
  const healthInsights = {
    lastLoggedWeight: latestWeight?.weightLbs || null,
    lastLoggedUnit: latestWeight?.unitLogged || null,
    lastLoggedAt: latestWeight?.loggedAt || null,
  };

  // Next appointment data
  const nextAppointment = await Appointment.findOne({
    patient: userId,
    status: "scheduled",
    startTime: { $gt: new Date() },
  }).sort({ startTime: 1 });

  let appointmentData = null;
  if (nextAppointment) {
    const daysUntil = Math.ceil((nextAppointment.startTime - new Date()) / (1000 * 60 * 60 * 24));
    appointmentData = {
      startTime: nextAppointment.startTime,
      daysUntil,
      meetingLink: nextAppointment.meetingLink,
      status: nextAppointment.status,
      formattedDate: dayjs(nextAppointment.startTime).tz("America/New_York").format("MMM D, YYYY"),
      formattedTime: dayjs(nextAppointment.startTime).tz("America/New_York").format("h:mm A")
    };
  }

  // Provider info
  let providerData = null;
  if (patient.assignedProvider) {
    const provider = await Provider.findOne({ user: patient.assignedProvider }).populate("user", "firstName lastName");
    if (provider) {
      providerData = {
        _id: provider._id,
        name: `${provider.user.firstName} ${provider.user.lastName}`,
        title: "Board Certified FNP",
        avatar: provider.user.avatar,
      };
    }
  }

  return {
    patient: {
      firstName: patient.user.firstName,
      lastName: patient.user.lastName,
      email: patient.user.email,
      avatar: patient.user.avatar,
      cardBrand: patient.cardBrand || "Visa",
      cardLast4: patient.cardLast4 || "1234",
    },
    programs: programsData,
    healthInsights,
    nextAppointment: appointmentData,
    assignedProvider: providerData,
  };
};

/**
 * Get My NP page — provider info + next appointment (two-state)
 */
export const getMyNp = async (userId) => {
  const patient = await Patient.findOne({ user: userId });
  if (!patient) throw new ApiError(404, "Patient profile not found");
  if (!patient.assignedProvider) throw new ApiError(404, "No provider assigned");

  const provider = await Provider.findOne({ user: patient.assignedProvider }).populate(
    "user",
    "firstName lastName email avatar"
  );
  if (!provider) throw new ApiError(404, "Provider not found");

  // Next appointment with this provider
  const nextAppointment = await Appointment.findOne({
    patient: userId,
    provider: patient.assignedProvider,
    status: "scheduled",
    startTime: { $gt: new Date() },
  }).sort({ startTime: 1 });

  let appointmentData = null;
  if (nextAppointment) {
    const daysUntil = Math.ceil((nextAppointment.startTime - new Date()) / (1000 * 60 * 60 * 24));
    appointmentData = {
      _id: nextAppointment._id,
      calBookingId: nextAppointment.calBookingId,
      startTime: nextAppointment.startTime,
      endTime: nextAppointment.endTime,
      meetingLink: nextAppointment.meetingLink,
      status: nextAppointment.status,
      daysUntil,
      formattedDate: dayjs(nextAppointment.startTime).tz("America/New_York").format("MMM D, YYYY"),
      formattedTime: dayjs(nextAppointment.startTime).tz("America/New_York").format("h:mm A")
    };
  }

  return {
    provider: {
      _id: provider._id,
      firstName: provider.user.firstName,
      lastName: provider.user.lastName,
      name: `${provider.user.firstName} ${provider.user.lastName}`,
      title: provider.title || "Board Certified FNP",
      avatar: provider.user.avatar,
      npSince: provider.npSince,
    },
    appointment: appointmentData,
  };
};

/**
 * Log weight — convert kg→lbs if needed, create WeightLog
 */
export const logWeight = async (userId, weight, unit, loggedAt) => {
  const weightLbs = unit === "kg" ? weight * LBS_PER_KG : weight;

  const log = await WeightLog.create({
    patient: userId,
    weightLbs: Math.round(weightLbs * 10) / 10,
    unitLogged: unit,
    loggedAt: loggedAt || new Date(),
  });

  return log;
};

/**
 * Log injection
 */
export const logInjection = async (userId, site, injectedAt, dosage, notes) => {
  const log = await InjectionLog.create({
    patient: userId,
    site,
    dosage,
    injectedAt,
    notes: notes || "",
  });

  return log;
};

/**
 * Get injection history — all logs sorted by date with summary
 */
export const getInjectionHistory = async (userId) => {
  const history = await InjectionLog.find({ patient: userId }).sort({ injectedAt: -1 });

  // Calculate monthly progress (Injections this calendar month vs target 4)
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthInjections = history.filter((log) => log.injectedAt >= startOfMonth).length;

  return {
    history,
    monthlyProgress: {
      count: thisMonthInjections,
      total: 4,
      label: `${thisMonthInjections} of 4 injections`,
      percentage: Math.round((thisMonthInjections / 4) * 100),
    },
  };
};

export const getWeightHistory = async (userId) => {
  const patient = await Patient.findOne({ user: userId });

  // Get all logs sorted latest first
  const history = await WeightLog.find({ patient: userId })
    .sort({ loggedAt: -1 });

  // Current month boundaries
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Filter current month logs
  const thisMonthLogs = history.filter(
    (log) => log.loggedAt >= startOfMonth
  );

  // Format entries (day + time + weight)
  const formattedLogs = thisMonthLogs.map((log) => ({
    id: log._id,
    weight: log.weightLbs,
    unit: log.unitLogged,
    date: log.loggedAt,
    day: log.loggedAt.getDate(),
    time: log.loggedAt.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
  }));

  // Optional: monthly stats (start vs latest weight)
  let monthlyChange = null;

  if (thisMonthLogs.length > 0) {
    const oldest = thisMonthLogs[thisMonthLogs.length - 1];
    const latest = thisMonthLogs[0];

    monthlyChange = {
      startWeight: oldest.weightLbs,
      currentWeight: latest.weightLbs,
      change: latest.weightLbs - oldest.weightLbs,
    };
  }

  return {
    history: formattedLogs,
    monthlySummary: {
      count: thisMonthLogs.length,
      change: monthlyChange,
    },
    npCheckinDate: patient?.npCheckinDate || null,
    formattedNpCheckinDate: patient?.npCheckinDate 
      ? dayjs(patient.npCheckinDate).tz("America/New_York").format("MMM D, YYYY") 
      : null,
  };
};
