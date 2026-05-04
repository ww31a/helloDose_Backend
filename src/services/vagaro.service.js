import axios from "axios";
import { ApiError } from "../utils/ApiError.js";
import logger from "../utils/logger.js";

/**
 * Vagaro Service
 *
 * Mental model:
 *   Webhooks = entry points (deliver IDs)
 *   APIs     = enrichment layer (turn IDs into full data)
 *   DB       = working dataset (built from hydrated data)
 *
 * All Vagaro API calls are POST — even reads.
 * Auth uses a custom `accessToken` header, NOT Authorization: Bearer.
 * businessId is injected into every request body automatically.
 */

const BASE_URL = process.env.VAGARO_BASE_URL || "https://api.vagaro.com/us03/api/v2";
const BUSINESS_ID = process.env.VAGARO_BUSINESS_ID;

// Extract region from base URL (e.g. "us03")
const regionMatch = BASE_URL.match(/vagaro\.com\/([^/]+)\//);
const REGION = regionMatch ? regionMatch[1] : "us03";

// ── Token cache ───────────────────────────────────────────────────────────────
let cachedToken = null;
let tokenExpiry = null;

const getAccessToken = async () => {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  // Correct endpoint: POST /merchants/generate-access-token
  // Body: { clientSecretKey } only
  const res = await axios.post(
    `https://api.vagaro.com/${REGION}/api/v2/merchants/generate-access-token`,
    {
      clientID: process.env.VAGARO_CLIENT_ID,
      clientSecretKey: process.env.VAGARO_CLIENT_SECRET,
    },
    { headers: { "Content-Type": "application/json" } }
  );

  // Response shape: { status, data: { access_token, expires_in } }
  const token = res.data?.data?.access_token ?? res.data?.access_token;
  if (!token) throw new Error(`No access_token in Vagaro response: ${JSON.stringify(res.data)}`);

  cachedToken = token;
  tokenExpiry = Date.now() + 50 * 60 * 1000; // refresh at 50 min, token lives ~60 min
  return cachedToken;
};

// ── Shared request helper ─────────────────────────────────────────────────────
const vagaroPost = async (path, body = {}, params = {}) => {
  try {
    const token = await getAccessToken();
    const res = await axios.post(
      `${BASE_URL}${path}`,
      { businessId: BUSINESS_ID, ...body },
      {
        params,
        headers: {
          accept: "application/json",
          accessToken: token,
          "content-type": "application/json",
        },
      }
    );
    return res.data;
  } catch (err) {
    logger.error(`Vagaro API error [${path}]: ${err.message}`);
    throw new ApiError(502, `Vagaro request failed: ${path}`);
  }
};

// ── API functions ─────────────────────────────────────────────────────────────

export const getEmployee = ({ serviceProviderId }) =>
  vagaroPost("/employees", { serviceProviderId });

export const getCustomer = ({ customerId }) =>
  vagaroPost("/customer", { customerId });

export const getServices = ({ serviceId, pageNumber = 1, pageSize = 20 } = {}) =>
  vagaroPost("/services", serviceId ? { serviceId } : {}, { pageNumber, pageSize });

export const getAppointments = ({
  appointmentId,
  customerId,
  pageNumber = 1,
  pageSize = 20,
  orderBy = "desc",
} = {}) =>
  vagaroPost(
    "/appointments",
    {
      ...(appointmentId && { appointmentId }),
      ...(customerId && { customerId }),
    },
    { pageNumber, pageSize, orderBy }
  );

// ── Webhook handler functions ─────────────────────────────────────────────────

/**
 * appointment.created / appointment.updated
 * Fan-out: hydrate all 4 entities in parallel, then upsert into DB.
 */
export const handleAppointmentEvent = async (data) => {
  const { User } = await import("../models/user.model.js");
  const { Appointment } = await import("../models/appointment.model.js");

  const [apptData, customerData, employeeData] = await Promise.all([
    getAppointments({ appointmentId: data.appointmentId }),
    getCustomer({ customerId: data.customerId }),
    getEmployee({ serviceProviderId: data.serviceProviderId }),
    getServices({ serviceId: data.serviceId }), // fire but we don't need the result for upserts
  ]);

  const appt = apptData?.appointments?.[0] ?? apptData;

  // Upsert patient User
  const patient = await User.findOneAndUpdate(
    { vagaro_id: data.customerId },
    {
      $set: {
        vagaro_id: data.customerId,
        firstName: customerData.firstName,
        lastName: customerData.lastName,
        email: customerData.email,
        role: "patient",
      },
    },
    { upsert: true, new: true }
  );

  // Upsert provider User
  const provider = await User.findOneAndUpdate(
    { vagaro_id: data.serviceProviderId },
    {
      $set: {
        vagaro_id: data.serviceProviderId,
        firstName: employeeData.firstName,
        lastName: employeeData.lastName,
        email: employeeData.email,
        role: "provider",
      },
    },
    { upsert: true, new: true }
  );

  // Upsert Appointment
  await Appointment.findOneAndUpdate(
    { vagaro_appointment_id: data.appointmentId },
    {
      $set: {
        vagaro_appointment_id: data.appointmentId,
        patient: patient._id,
        provider: provider._id,
        serviceId: data.serviceId,
        startTime: appt.startTime,
        endTime: appt.endTime,
        status: appt.status ?? "scheduled",
      },
    },
    { upsert: true, new: true }
  );

  logger.info(`[Vagaro] appointment upserted: ${data.appointmentId}`);
};

/**
 * appointment.deleted
 */
export const handleAppointmentDeleted = async (data) => {
  const { Appointment } = await import("../models/appointment.model.js");

  const result = await Appointment.findOneAndUpdate(
    { vagaro_appointment_id: data.appointmentId },
    { $set: { status: "cancelled" } }
  );

  if (!result) {
    logger.warn(`[Vagaro] appointment.deleted — no record found for ${data.appointmentId}`);
  }
};

/**
 * customer.created / customer.updated
 */
export const handleCustomerEvent = async (data) => {
  const { User } = await import("../models/user.model.js");

  const customerData = await getCustomer({ customerId: data.customerId });

  await User.findOneAndUpdate(
    { vagaro_id: data.customerId },
    {
      $set: {
        vagaro_id: data.customerId,
        firstName: customerData.firstName,
        lastName: customerData.lastName,
        email: customerData.email,
        role: "patient",
      },
    },
    { upsert: true, new: true }
  );

  logger.info(`[Vagaro] customer upserted: ${data.customerId}`);
};

/**
 * employee.created / employee.updated
 */
export const handleEmployeeEvent = async (data) => {
  const { User } = await import("../models/user.model.js");

  const employeeData = await getEmployee({ serviceProviderId: data.serviceProviderId });

  await User.findOneAndUpdate(
    { vagaro_id: data.serviceProviderId },
    {
      $set: {
        vagaro_id: data.serviceProviderId,
        firstName: employeeData.firstName,
        lastName: employeeData.lastName,
        email: employeeData.email,
        role: "provider",
      },
    },
    { upsert: true, new: true }
  );

  logger.info(`[Vagaro] employee upserted: ${data.serviceProviderId}`);
};

/**
 * form_response — Weight Loss Intake Form
 * Stores: gender, height, weight (as initialWeight), primaryGoal on Patient
 */
export const handleWeightLossIntakeForm = async (data) => {
  const { User } = await import("../models/user.model.js");
  const { Patient } = await import("../models/patient.model.js");

  const { gender, height, weight, primaryGoal } = data.fields ?? {};

  const user = await User.findOne({ vagaro_id: data.customerId });
  if (!user) {
    logger.warn(`[Vagaro] Weight Loss Intake Form — no user found for vagaro_id ${data.customerId}`);
    return;
  }

  const patient = await Patient.findOne({ user: user._id });
  if (!patient) {
    logger.warn(`[Vagaro] Weight Loss Intake Form — no patient found for user ${user._id}`);
    return;
  }

  await Patient.findOneAndUpdate(
    { user: user._id },
    { $set: { gender, height, primaryGoal } },
    { new: true }
  );

  if (weight) {
    const { WeightLog } = await import("../models/weightLog.model.js");
    const existingLog = await WeightLog.findOne({ patient: user._id, weightLbs: parseFloat(weight) });
    if (!existingLog) {
      await WeightLog.create({
        patient: user._id,
        weightLbs: parseFloat(weight),
        unitLogged: "lbs",
        loggedAt: new Date()
      });
      logger.info(`[Vagaro] Created initial WeightLog from Intake form for patient ${user._id} with weight ${weight}`);
    }
  }

  logger.info(`[Vagaro] Weight Loss Intake Form stored for patient ${patient._id}`);
};

/**
 * form_response — DROP Virtual Consultation with Nurse Practitioner Copy
 * Stores: startWeight, currentDosage, medication, targetWeightLoss, followUpTiming on Program
 */
export const handleDropConsultationForm = async (data) => {
  const { User } = await import("../models/user.model.js");
  const { Patient } = await import("../models/patient.model.js");
  const { Program } = await import("../models/program.model.js");

  const {
    startingWeight,
    weightLossGoal,
    medication,
    startingDose,
    followUpTiming,
  } = data.fields ?? {};

  const user = await User.findOne({ vagaro_id: data.customerId });
  if (!user) {
    logger.warn(`[Vagaro] DROP Consultation Form — no user found for vagaro_id ${data.customerId}`);
    return;
  }

  const patient = await Patient.findOne({ user: user._id });
  if (!patient) {
    logger.warn(`[Vagaro] DROP Consultation Form — no patient found for user ${user._id}`);
    return;
  }

  const program = await Program.findOne({ patient: user._id, isActive: true });
  if (!program) {
    logger.warn(`[Vagaro] DROP Consultation Form — no active program found for patient ${user._id}`);
    return;
  }

  const updatedProgram = await Program.findOneAndUpdate(
    { _id: program._id },
    {
      $set: {
        ...(startingWeight && { startWeight: parseFloat(startingWeight) }),
        ...(weightLossGoal && { targetWeightLoss: parseFloat(weightLossGoal) }),
        ...(medication && { medication }),
        ...(startingDose && { currentDosage: startingDose }),
        ...(followUpTiming && { followUpTiming }),
      },
    },
    { new: true }
  );

  if (startingWeight) {
    const { WeightLog } = await import("../models/weightLog.model.js");
    // Only create initial log if they don't have any logs yet, or just log it as the starting baseline
    const existingLog = await WeightLog.findOne({ patient: user._id, weightLbs: parseFloat(startingWeight) });
    if (!existingLog) {
      await WeightLog.create({
        patient: user._id,
        weightLbs: parseFloat(startingWeight),
        unitLogged: "lbs",
        loggedAt: updatedProgram.startedAt || new Date()
      });
      logger.info(`[Vagaro] Created initial WeightLog for patient ${user._id} with starting weight ${startingWeight}`);
    }
  }

  logger.info(`[Vagaro] DROP Consultation Form stored for program ${program._id}`);
};
