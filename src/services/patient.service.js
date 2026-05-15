import { Patient } from "../models/patient.model.js";
import { Plan } from "../models/plan.model.js";
import { WeightLog } from "../models/weightLog.model.js";
import { InjectionLog } from "../models/injectionLog.model.js";
import { Appointment } from "../models/appointment.model.js";
import { Provider } from "../models/provider.model.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { uploadToCloudinary } from "../utils/cloudinary.js";
import { LBS_PER_KG } from "../constants.js";
import { getNextRefillDate, getDaysUntilNextRefill } from "../utils/refillDate.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const ONBOARDING_INJECTION_NOTE = "Reported during onboarding";
const DAYS_IN_INJECTION_CYCLE = 30;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

const getCurrentMonthStart = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
};

const getInjectionIntervalDays = (frequency) => {
  const numericFrequency = Number(frequency);
  if (!numericFrequency || Number.isNaN(numericFrequency) || numericFrequency <= 0) {
    return null;
  }

  return DAYS_IN_INJECTION_CYCLE / numericFrequency;
};

const addDays = (date, days) => new Date(date.getTime() + days * MS_PER_DAY);

const getDayLabel = (days, suffix = "days") => {
  if (days === 0) return "Today";
  if (days === 1) return `1 ${suffix.slice(0, -1)}`;
  return `${days} ${suffix}`;
};

const syncOnboardingInjectionLogs = async (userId, plan, injectionsThisMonth) => {
  const count = Math.max(0, Number(injectionsThisMonth) || 0);
  const periodStart = getCurrentMonthStart();

  await InjectionLog.deleteMany({
    patient: userId,
    plan: plan._id,
    notes: ONBOARDING_INJECTION_NOTE,
    injectedAt: { $gte: periodStart },
  });

  if (count === 0) return;

  const reportedAt = new Date();
  const logs = Array.from({ length: count }, () => ({
    patient: userId,
    plan: plan._id,
    medication: plan.name,
    dosage: plan.currentDosage || "",
    injectedAt: reportedAt,
    notes: ONBOARDING_INJECTION_NOTE,
  }));

  await InjectionLog.insertMany(logs);
};

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
        { plan: { $exists: false }, medication: plan.name },
        { plan: { $exists: false }, dosage: { $regex: new RegExp(plan.currentDosage, 'i') } }
      ]
    }).sort({ injectedAt: -1 });

    const hasWeightProgress = plan.startWeight !== undefined
      && plan.startWeight !== null
      && latestWeight?.weightLbs !== undefined
      && latestWeight?.weightLbs !== null;
    const currentWeightLoss = hasWeightProgress
      ? plan.startWeight - latestWeight.weightLbs
      : null;
    const progressPercent = plan.targetWeightLoss && currentWeightLoss !== null
      ? Math.min(100, Math.round((currentWeightLoss / plan.targetWeightLoss) * 100))
      : null;

    const computedNextRefillDate = getNextRefillDate(plan.startedAt);
    let reorderStatus = null;
    let daysUntilNextRefill = null;
    let nextRefillLabel = null;
    if (computedNextRefillDate) {
      daysUntilNextRefill = getDaysUntilNextRefill(plan.startedAt);
      reorderStatus = daysUntilNextRefill <= 0
        ? "eligible_now"
        : `eligible_in_${daysUntilNextRefill}_days`;
      nextRefillLabel = daysUntilNextRefill <= 0
        ? "Available now"
        : `In ${getDayLabel(daysUntilNextRefill)}`;
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
          firstName: provider.user.firstName,
          lastName: provider.user.lastName,
          title: provider.title || "Board Certified FNP",
          avatar: provider.user.avatar,
        };
      }
    }

    const details = {
      _id: plan._id,
      name: plan.name,
      medication: plan.name,
      type: plan.type,
      startedAt: plan.startedAt,
      targetWeightLoss: plan.targetWeightLoss,
      currentWeightLoss: currentWeightLoss !== null ? Math.round(currentWeightLoss * 10) / 10 : null,
      progressPercent,
      monthsCompleted,
      durationMonths: plan.durationMonths,
      frequency: Number(plan.frequency) || null,
      lastReorderDate: plan.lastReorderDate,
      eligibleToReorderAt: computedNextRefillDate,
      reorderStatus,
      daysUntilNextRefill,
      assignedProvider: planProviderData,
    };

    // Health insights for this specific plan
    const totalLossPercent = hasWeightProgress
      ? Math.round(((latestWeight.weightLbs - plan.startWeight) / plan.startWeight) * 100 * 10) / 10
      : null;

    const firstWeightLog = await WeightLog.findOne({
      patient: userId,
      loggedAt: { $gte: plan.startedAt },
    }).sort({ loggedAt: 1 });

    const frequency = Number(plan.frequency);
    const injectionIntervalDays = getInjectionIntervalDays(frequency);
    let daysSinceLastInjection = null;
    let nextInjectionDate = null;
    let daysUntilNextInjection = null;

    if (latestInjection && injectionIntervalDays) {
      daysSinceLastInjection = dayjs().startOf('day').diff(dayjs(latestInjection.injectedAt).startOf('day'), 'day');
      nextInjectionDate = addDays(new Date(latestInjection.injectedAt), injectionIntervalDays);
      daysUntilNextInjection = Math.max(0, Math.ceil((nextInjectionDate - new Date()) / MS_PER_DAY));
    }

    const periodStart = getCurrentMonthStart();

    const currentPeriodLogsCount = await InjectionLog.countDocuments({
      patient: userId,
      plan: plan._id,
      injectedAt: { $gte: periodStart }
    });

      const insights = {
        currentDosage: plan.currentDosage,
        lastInjectionAt: latestInjection?.injectedAt || null,
        daysSinceLastInjection,
        nextInjectionDate,
        daysUntilNextInjection,
        nextInjectionLabel: daysUntilNextInjection !== null 
          ? getDayLabel(daysUntilNextInjection)
          : null,
        injectionIntervalDays,
        nextRefillDate: computedNextRefillDate,
        daysUntilNextRefill,
        nextRefillLabel,
        totalLossPercent,
        startWeight: plan.startWeight,
        injectionFrequency: {
          count: currentPeriodLogsCount,
          total: frequency,
          label: frequency ? `${currentPeriodLogsCount} of ${frequency} injections` : null,
          isLimitReached: frequency ? currentPeriodLogsCount >= frequency : false
        }
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
    const daysUntil = Math.ceil((nextAppointment.startTime - new Date()) / MS_PER_DAY);
    appointmentData = {
      startTime: nextAppointment.startTime,
      daysUntil,
      meetingLink: nextAppointment.meetingLink,
      status: nextAppointment.status,
      formattedDate: dayjs(nextAppointment.startTime).format("MMM D, YYYY"),
      formattedTime: dayjs(nextAppointment.startTime).format("h:mm A")
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
        firstName: provider.user.firstName,
        lastName: provider.user.lastName,
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
 * Get active plans for onboarding
 */
export const getActivePlans = async (userId) => {
  const activePlans = await Plan.find({ patient: userId, isActive: true }).select("name currentDosage frequency onboardingInjectionsThisMonth startWeight targetWeightLoss type");
  return activePlans;
};

/**
 * Get onboarding progress and plans.
 */
export const getOnboardingStatus = async (userId) => {
  const user = await User.findById(userId).select("role avatar onboardingCompleted");
  if (!user) throw new ApiError(404, "User not found");

  const patient = await Patient.findOne({ user: userId }).select("onboardingProgress");
  if (!patient) throw new ApiError(404, "Patient profile not found");

  const plans = user.role === "patient" ? await getActivePlans(userId) : [];
  const onboardingProgress = patient.onboardingProgress || {};
  const progress = {
    totalBars: 3,
    completedBars: [
      onboardingProgress.photoCompleted,
      onboardingProgress.plansCompleted,
      onboardingProgress.startWeightCompleted,
    ].filter(Boolean).length,
    photoCompleted: Boolean(onboardingProgress.photoCompleted),
    plansCompleted: Boolean(onboardingProgress.plansCompleted),
    startWeightCompleted: Boolean(onboardingProgress.startWeightCompleted),
  };

  return {
    onboardingCompleted: user.onboardingCompleted,
    progress,
    plans,
    requiredScreens: {
      photo: true,
      plans: Math.max(plans.length, 1),
      startWeight: true,
      goalWeight: true,
    },
  };
};

/**
 * Mark one onboarding progress milestone complete.
 */
export const markOnboardingStep = async (userId, step) => {
  const allowedSteps = ["photoCompleted", "plansCompleted", "startWeightCompleted"];
  if (!allowedSteps.includes(step)) {
    throw new ApiError(400, "Invalid onboarding step");
  }

  const patient = await Patient.findOneAndUpdate(
    { user: userId },
    { $set: { [`onboardingProgress.${step}`]: true } },
    { new: true }
  ).select("onboardingProgress");

  if (!patient) throw new ApiError(404, "Patient profile not found");
  return { onboardingProgress: patient.onboardingProgress };
};

/**
 * Update plan details during onboarding
 */
export const updatePlanDosage = async (userId, planId, dosage, frequency, injectionsThisMonth) => {
  const update = {};
  if (dosage !== undefined) update.currentDosage = String(dosage);
  if (frequency !== undefined) update.frequency = Number(frequency);
  if (injectionsThisMonth !== undefined) update.onboardingInjectionsThisMonth = Number(injectionsThisMonth);

  const plan = await Plan.findOneAndUpdate(
    { _id: planId, patient: userId },
    update,
    { new: true }
  );
  if (!plan) throw new ApiError(404, "Plan not found");

  if (injectionsThisMonth !== undefined) {
    await syncOnboardingInjectionLogs(userId, plan, injectionsThisMonth);
  }

  return plan;
};

/**
 * Update onboarding weights (start weight and target loss)
 */
export const updateOnboardingWeights = async (userId, startWeight, targetWeightLoss, goalWeight) => {
  const numericStartWeight = Number(startWeight);
  let numericTargetWeightLoss = targetWeightLoss !== undefined ? Number(targetWeightLoss) : undefined;
  const numericGoalWeight = goalWeight !== undefined ? Number(goalWeight) : undefined;

  if (!numericStartWeight || Number.isNaN(numericStartWeight)) {
    throw new ApiError(400, "A valid start weight is required");
  }

  if (numericGoalWeight !== undefined && !Number.isNaN(numericGoalWeight)) {
    numericTargetWeightLoss = Math.max(0, numericStartWeight - numericGoalWeight);
  }

  const planUpdate = { startWeight: numericStartWeight };
  if (numericTargetWeightLoss !== undefined && !Number.isNaN(numericTargetWeightLoss)) {
    planUpdate.targetWeightLoss = numericTargetWeightLoss;
  }

  // Update all active weight-loss plans for this patient
  await Plan.updateMany(
    { patient: userId, isActive: true, type: "weight-loss" },
    planUpdate
  );
  
  // Also log the start weight to WeightLog
  if (numericStartWeight) {
    const existingStartLog = await WeightLog.findOne({
      patient: userId,
      weightLbs: numericStartWeight,
    });

    if (!existingStartLog) {
      await WeightLog.create({
        patient: userId,
        weightLbs: numericStartWeight,
        unitLogged: "lbs",
        loggedAt: new Date(),
      });
    }
  }

  return { success: true, startWeight: numericStartWeight, goalWeight: numericGoalWeight, targetWeightLoss: numericTargetWeightLoss };
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
  const normalizedWeightLbs = Math.round(weightLbs * 10) / 10;

  const log = await WeightLog.create({
    patient: userId,
    weightLbs: normalizedWeightLbs,
    unitLogged: unit,
    loggedAt: loggedAt || new Date(),
  });

  await Plan.updateMany(
    {
      patient: userId,
      isActive: true,
      type: "weight-loss",
      $or: [
        { startWeight: { $exists: false } },
        { startWeight: null },
      ],
    },
    { $set: { startWeight: normalizedWeightLbs } }
  );

  return log;
};

/**
 * Log injection
 */
export const logInjection = async (userId, site, injectedAt, dosage, notes, planId, medication) => {
  // 1. Fetch plan and enforce frequency limit
  const plan = planId ? await Plan.findOne({ _id: planId, patient: userId }) : null;
  if (planId && !plan) throw new ApiError(404, "Plan not found");

  if (plan) {
    const frequency = Number(plan.frequency);
    
    // Period: current calendar month
    const periodStart = getCurrentMonthStart();

    const currentPeriodLogs = await InjectionLog.countDocuments({
      patient: userId,
      plan: planId,
      injectedAt: { $gte: periodStart }
    });

    if (frequency && currentPeriodLogs >= frequency) {
      throw new ApiError(400, `You have reached your limit of ${frequency} injections for this period.`);
    }
  }

  // If medication isn't provided, try to fetch it from the plan
  let med = medication;
  if (!med && plan) {
    med = plan.name;
  }

  if (!med) throw new ApiError(400, "Medication is required when logging an injection without a plan");

  const log = await InjectionLog.create({
    patient: userId,
    plan: planId,
    medication: med,
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
  let plan = null;

  if (planId) {
    plan = await Plan.findOne({ _id: planId, patient: userId });
    if (plan) {
      query = {
        patient: userId,
        $or: [
          { plan: planId },
          { plan: { $exists: false }, medication: plan.name },
          { plan: { $exists: false }, dosage: { $regex: new RegExp(plan.currentDosage, 'i') } }
        ]
      };
    } else {
      throw new ApiError(404, "Plan not found");
    }
  }

  const history = await InjectionLog.find(query).sort({ injectedAt: -1 });

  // Calculate progress based on plan frequency (strictly per month)
  const frequency = plan ? Number(plan.frequency) : null;

  const periodStart = getCurrentMonthStart();

  const currentPeriodInjections = history.filter((log) => log.injectedAt >= periodStart).length;

  return {
    history,
    monthlyProgress: {
      count: currentPeriodInjections,
      total: frequency,
      label: frequency ? `${currentPeriodInjections} of ${frequency} injections` : null,
      percentage: frequency ? Math.min(100, Math.round((currentPeriodInjections / frequency) * 100)) : null,
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

  // Format all entries for the chart
  const allFormattedLogs = history.map((log) => ({
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

  // Format only this month's logs for the list
  const formattedThisMonthLogs = thisMonthLogs.map((log) => ({
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
    history: formattedThisMonthLogs,
    allHistory: allFormattedLogs,
    monthlySummary: {
      count: thisMonthLogs.length,
      change: monthlyChange,
    },
    npCheckinDate: patient?.npCheckinDate || null,
    formattedNpCheckinDate: patient?.npCheckinDate 
      ? dayjs(patient.npCheckinDate).format("MMM D, YYYY") 
      : null,
  };
};

/**
 * Upload avatar — saves to Cloudinary and updates user record
 */
export const uploadAvatar = async (userId, fileBuffer) => {
  if (!fileBuffer) throw new ApiError(400, "No image file provided");

  const { url } = await uploadToCloudinary(fileBuffer, "hellodose/avatars");

  const user = await User.findByIdAndUpdate(
    userId,
    { avatar: url },
    { new: true }
  ).select("firstName lastName email avatar role");

  if (!user) throw new ApiError(404, "User not found");

  return { avatar: user.avatar };
};
