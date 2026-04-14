import { Patient } from "../models/patient.model.js";
import { Program } from "../models/program.model.js";
import { WeightLog } from "../models/weightLog.model.js";
import { InjectionLog } from "../models/injectionLog.model.js";
import { Appointment } from "../models/appointment.model.js";
import { Provider } from "../models/provider.model.js";
import { ApiError } from "../utils/ApiError.js";
import { LBS_PER_KG } from "../constants.js";

/**
 * Get patient dashboard — single aggregated response
 */
export const getDashboard = async (userId) => {
  const patient = await Patient.findOne({ user: userId }).populate("user", "firstName lastName email avatar");
  if (!patient) throw new ApiError(404, "Patient profile not found");

  // Program data
  const program = await Program.findOne({ patient: userId, isActive: true });

  // Latest weight log
  const latestWeight = await WeightLog.findOne({ patient: userId }).sort({ loggedAt: -1 });

  // Latest injection log
  const latestInjection = await InjectionLog.findOne({ patient: userId }).sort({ injectedAt: -1 });

  // Next appointment
  const nextAppointment = await Appointment.findOne({
    patient: userId,
    status: "scheduled",
    startTime: { $gt: new Date() },
  }).sort({ startTime: 1 });

  // Compute derived fields
  let programData = null;
  let healthInsights = null;

  if (program) {
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

    programData = {
      name: program.name,
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

    // Health insights
    const totalLossPercent = program.startWeight && latestWeight
      ? Math.round(((latestWeight.weightLbs - program.startWeight) / program.startWeight) * 100 * 10) / 10
      : 0;

    // Find earliest weight log after program start for "totalLossSince"
    const firstWeightLog = await WeightLog.findOne({
      patient: userId,
      loggedAt: { $gte: program.startedAt },
    }).sort({ loggedAt: 1 });

    // Injection calculations (Assuming 7-day frequency)
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

    healthInsights = {
      lastLoggedWeight: latestWeight?.weightLbs || null,
      lastLoggedUnit: latestWeight?.unitLogged || null,
      lastLoggedAt: latestWeight?.loggedAt || null,
      totalLossPercent,
      totalLossSince: firstWeightLog?.loggedAt || null,
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
  }

  // Next appointment data
  let appointmentData = null;
  if (nextAppointment) {
    const daysUntil = Math.ceil((nextAppointment.startTime - new Date()) / (1000 * 60 * 60 * 24));
    appointmentData = {
      startTime: nextAppointment.startTime,
      daysUntil,
      meetingLink: nextAppointment.meetingLink,
      status: nextAppointment.status,
    };
  }

  // Provider info
  let providerData = null;
  if (patient.assignedProvider) {
    const provider = await Provider.findOne({ user: patient.assignedProvider }).populate("user", "firstName lastName");
    if (provider) {
      providerData = {
        _id: provider.user._id,
        name: `${provider.user.firstName} ${provider.user.lastName}`,
        title: "Board Certified FNP", // Updated title to match screenshot
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
    program: programData,
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
    };
  }

  return {
    provider: {
      _id: provider.user._id,
      firstName: provider.user.firstName,
      lastName: provider.user.lastName,
      title: "NP",
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
