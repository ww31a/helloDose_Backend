import { Patient } from "../models/patient.model.js";
import { Plan } from "../models/plan.model.js";
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

  // Find all active plans
  const activePlans = await Plan.find({ patient: userId, isActive: true }).populate("assignedProvider");

  // Latest weight log (used for weight loss calculations)
  const latestWeight = await WeightLog.findOne({ patient: userId }).sort({ loggedAt: -1 });

  // Latest injection log (for general insights if needed, but we'll calculate per-plan if we assume injections are linked to plans)
  // For now, let's assume injection logs are generic but we might want to filter them by medication in the future.
  // To keep it simple and matching the UI, we'll get the latest injection log.

  const plansData = await Promise.all(activePlans.map(async (plan) => {
    // Latest injection for THIS medication
    const latestInjection = await InjectionLog.findOne({ 
      patient: userId,
      $or: [
        { plan: plan._id },
        { plan: { $exists: false }, medication: plan.medication },
        { plan: { $exists: false }, dosage: { $regex: new RegExp(plan.currentDosage, 'i') } }
      ]
    }).sort({ injectedAt: -1 });

    const currentWeightLoss = plan.startWeight && latestWeight
      ? plan.startWeight - latestWeight.weightLbs
      : 0;
    const progressPercent = plan.targetWeightLoss
      ? Math.min(100, Math.round((currentWeightLoss / plan.targetWeightLoss) * 100))
      : 0;

    // Reorder status
    let reorderStatus = "not_eligible";
    if (plan.nextRefillDate) {
      const daysToRefill = Math.ceil((plan.nextRefillDate - new Date()) / (1000 * 60 * 60 * 24));
      if (daysToRefill <= 0) reorderStatus = "eligible_now";
      else if (daysToRefill <= 21) reorderStatus = "eligible_in_3_weeks";
    }

    const monthsCompleted = Math.max(0, Math.floor((new Date() - plan.startedAt) / (1000 * 60 * 60 * 24 * 30)));

    // Provider for this specific plan
    let planProviderData = null;
    if (plan.assignedProvider) {
      const provider = await Provider.findOne({ user: plan.assignedProvider }).populate("user", "firstName lastName avatar");
      if (provider) {
        planProviderData = {
          _id: provider._id,
          name: `${provider.user.firstName} ${provider.user.lastName}`,
          title: provider.title || "Board Certified FNP",
          avatar: provider.user.avatar,
        };
      }
    }

    const details = {
      _id: plan._id,
      name: plan.name,
      medication: plan.medication,
      type: plan.type || "weight-loss",
      startedAt: plan.startedAt,
      targetWeightLoss: plan.targetWeightLoss,
      currentWeightLoss: Math.round(currentWeightLoss * 10) / 10,
      progressPercent,
      monthsCompleted,
      durationMonths: plan.durationMonths || 8,
      lastReorderDate: plan.lastReorderDate,
      eligibleToReorderAt: plan.nextRefillDate,
      reorderStatus,
      assignedProvider: planProviderData,
    };

    // Health insights for this specific plan
    const totalLossPercent = plan.startWeight && latestWeight
      ? Math.round(((latestWeight.weightLbs - plan.startWeight) / plan.startWeight) * 100 * 10) / 10
      : 0;

    const firstWeightLog = await WeightLog.findOne({
      patient: userId,
      loggedAt: { $gte: plan.startedAt },
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
        currentDosage: plan.currentDosage,
        lastInjectionAt: latestInjection?.injectedAt || null,
        daysSinceLastInjection,
        nextInjectionDate,
        daysUntilNextInjection,
        nextInjectionLabel: daysUntilNextInjection !== null 
          ? (daysUntilNextInjection === 0 ? "Today" : `${daysUntilNextInjection} days`)
          : null,
        nextRefillDate: plan.nextRefillDate,
        nextRefillLabel: plan.nextRefillDate
          ? `In ${Math.max(0, Math.ceil((plan.nextRefillDate - new Date()) / (1000 * 60 * 60 * 24 * 7)))} weeks`
          : null,
        totalLossPercent,
        startWeight: plan.startWeight,
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

  // Provider info (use the one from the first active plan if available, or fall back to patient-level if still exists)
  let providerData = null;
  const planWithProvider = activePlans.find(p => p.assignedProvider);
  if (planWithProvider) {
    const provider = await Provider.findOne({ user: planWithProvider.assignedProvider }).populate("user", "firstName lastName avatar");
    if (provider) {
      providerData = {
        _id: provider._id,
        name: `${provider.user.firstName} ${provider.user.lastName}`,
        title: provider.title || "Board Certified FNP",
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
    },
    plans: plansData,
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

  // Get active plans and find a provider
  const activePlans = await Plan.find({ patient: userId, isActive: true });
  const planWithProvider = activePlans.find(p => p.assignedProvider);

  if (!planWithProvider) throw new ApiError(404, "No provider assigned to any active plan");

  const provider = await Provider.findOne({ user: planWithProvider.assignedProvider }).populate(
    "user",
    "firstName lastName email avatar"
  );
  if (!provider) throw new ApiError(404, "Provider not found");

  // Next appointment with this provider
  const nextAppointment = await Appointment.findOne({
    patient: userId,
    provider: planWithProvider.assignedProvider,
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
export const logInjection = async (userId, site, injectedAt, dosage, notes, planId, medication) => {
  // If medication isn't provided, try to fetch it from the plan
  let med = medication;
  if (!med && planId) {
    const plan = await Plan.findById(planId);
    med = plan?.medication;
  }

  const log = await InjectionLog.create({
    patient: userId,
    plan: planId,
    medication: med || "Unknown",
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
export const getInjectionHistory = async (userId, planId) => {
  let query = { patient: userId };

  if (planId) {
    const plan = await Plan.findById(planId);
    if (plan) {
      query = {
        patient: userId,
        $or: [
          { plan: planId },
          { plan: { $exists: false }, medication: plan.medication },
          { plan: { $exists: false }, dosage: { $regex: new RegExp(plan.currentDosage, 'i') } }
        ]
      };
    } else {
      query.plan = planId;
    }
  }

  const history = await InjectionLog.find(query).sort({ injectedAt: -1 });

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
