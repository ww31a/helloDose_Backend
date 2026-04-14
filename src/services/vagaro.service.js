import axios from "axios";

/**
 * Vagaro Service
 *
 * Vagaro is the system of record for:
 *  - Patient information
 *  - Assigned NP (provider) mapping
 *  - Treatment program / medication data
 *  - Program-related details
 *
 * NOT used for: scheduling, video consultations, real-time appointment UI
 */

const vagaroClient = axios.create({
  baseURL: process.env.VAGARO_BASE_URL,
  headers: {
    Authorization: `Bearer ${process.env.VAGARO_API_KEY}`,
    "Content-Type": "application/json",
  },
  timeout: 10000,
});

// ── Customer / Patient APIs ──

/**
 * Fetch a customer (patient) from Vagaro by their Vagaro ID
 */
export const getCustomerById = async (vagaroCustomerId) => {
  try {
    const response = await vagaroClient.get(`/customers/${vagaroCustomerId}`);
    return response.data;
  } catch (error) {
    console.error("Vagaro getCustomerById error:", error?.response?.data || error.message);
    throw new Error(`Failed to fetch customer from Vagaro: ${error.message}`);
  }
};

/**
 * Search customers in Vagaro by email
 */
export const searchCustomerByEmail = async (email) => {
  try {
    const response = await vagaroClient.get("/customers", {
      params: { email },
    });
    return response.data;
  } catch (error) {
    console.error("Vagaro searchCustomerByEmail error:", error?.response?.data || error.message);
    throw new Error(`Failed to search customer in Vagaro: ${error.message}`);
  }
};

/**
 * Fetch all customers (paginated) from Vagaro
 */
export const getCustomers = async (page = 1, limit = 50) => {
  try {
    const response = await vagaroClient.get("/customers", {
      params: { page, limit },
    });
    return response.data;
  } catch (error) {
    console.error("Vagaro getCustomers error:", error?.response?.data || error.message);
    throw new Error(`Failed to fetch customers from Vagaro: ${error.message}`);
  }
};

// ── Employee / Provider APIs ──

/**
 * Fetch an employee (provider/NP) from Vagaro by their Vagaro ID
 */
export const getEmployeeById = async (vagaroEmployeeId) => {
  try {
    const response = await vagaroClient.get(`/employees/${vagaroEmployeeId}`);
    return response.data;
  } catch (error) {
    console.error("Vagaro getEmployeeById error:", error?.response?.data || error.message);
    throw new Error(`Failed to fetch employee from Vagaro: ${error.message}`);
  }
};

// ── Service / Program APIs ──

/**
 * Fetch services (treatment programs) from Vagaro
 */
export const getServices = async () => {
  try {
    const response = await vagaroClient.get("/services");
    return response.data;
  } catch (error) {
    console.error("Vagaro getServices error:", error?.response?.data || error.message);
    throw new Error(`Failed to fetch services from Vagaro: ${error.message}`);
  }
};

/**
 * Fetch a specific service by ID
 */
export const getServiceById = async (serviceId) => {
  try {
    const response = await vagaroClient.get(`/services/${serviceId}`);
    return response.data;
  } catch (error) {
    console.error("Vagaro getServiceById error:", error?.response?.data || error.message);
    throw new Error(`Failed to fetch service from Vagaro: ${error.message}`);
  }
};

// ── Data Sync Helpers ──

/**
 * Sync a Vagaro customer into our Patient + User records
 * Called by webhook handler or manual sync
 */
export const syncCustomerToPatient = async (vagaroCustomerData) => {
  // Import models here to avoid circular dependency
  const { User } = await import("../models/user.model.js");
  const { Patient } = await import("../models/patient.model.js");

  const {
    id: vagaroId,
    firstName,
    lastName,
    email,
  } = vagaroCustomerData;

  if (!email) {
    console.error("Vagaro customer has no email, skipping sync:", vagaroId);
    return null;
  }

  // Find or create user
  let user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    user = await User.create({
      firstName,
      lastName,
      email: email.toLowerCase(),
      role: "patient",
    });
  } else {
    // Update name if changed in Vagaro
    user.firstName = firstName || user.firstName;
    user.lastName = lastName || user.lastName;
    await user.save();
  }

  // Find or create patient profile
  let patient = await Patient.findOne({ user: user._id });
  if (!patient) {
    patient = await Patient.create({
      user: user._id,
      vagaro_id: vagaroId.toString(),
    });
  } else {
    patient.vagaro_id = vagaroId.toString();
    await patient.save();
  }

  return { user, patient };
};

/**
 * Sync a Vagaro employee into our Provider + User records
 */
export const syncEmployeeToProvider = async (vagaroEmployeeData) => {
  const { User } = await import("../models/user.model.js");
  const { Provider } = await import("../models/provider.model.js");

  const {
    id: vagaroId,
    firstName,
    lastName,
    email,
  } = vagaroEmployeeData;

  if (!email) {
    console.error("Vagaro employee has no email, skipping sync:", vagaroId);
    return null;
  }

  let user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    user = await User.create({
      firstName,
      lastName,
      email: email.toLowerCase(),
      role: "provider",
    });
  }

  let provider = await Provider.findOne({ user: user._id });
  if (!provider) {
    provider = await Provider.create({
      user: user._id,
      vagaro_id: vagaroId.toString(),
      npSince: new Date(),
    });
  } else {
    provider.vagaro_id = vagaroId.toString();
    await provider.save();
  }

  return { user, provider };
};

/**
 * Sync Vagaro service data into our Program model
 */
export const syncServiceToProgram = async (vagaroServiceData, patientUserId) => {
  const { Program } = await import("../models/program.model.js");

  const {
    id: vagaroId,
    name,
    // Map Vagaro service names to our medication enum
  } = vagaroServiceData;

  // Determine medication type from service name
  const lowerName = (name || "").toLowerCase();
  let medication = "tirzepatide"; // default
  if (lowerName.includes("semaglutide") || lowerName.includes("ozempic") || lowerName.includes("wegovy")) {
    medication = "semaglutide";
  }

  let program = await Program.findOne({ vagaro_id: vagaroId.toString(), patient: patientUserId });
  if (!program) {
    program = await Program.create({
      patient: patientUserId,
      name: name || "Treatment Program",
      medication,
      startedAt: new Date(),
      vagaro_id: vagaroId.toString(),
      isActive: true,
    });
  } else {
    program.name = name || program.name;
    program.medication = medication;
    await program.save();
  }

  return program;
};

// ── Webhook Event Processing ──

/**
 * Process Vagaro webhook events
 * Event types: customer.created, customer.updated, employee.created, employee.updated, transaction.created
 */
export const processWebhookEvent = async (eventType, payload) => {
  switch (eventType) {
    case "customer.created":
    case "customer.updated":
      return syncCustomerToPatient(payload);

    case "employee.created":
    case "employee.updated":
      return syncEmployeeToProvider(payload);

    default:
      console.log(`Unhandled Vagaro webhook event: ${eventType}`);
      return null;
  }
};
