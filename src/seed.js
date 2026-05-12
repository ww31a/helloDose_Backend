/**
 * Seed script — creates test data for MVP development
 * Run: npm run seed
 */
import mongoose from "mongoose";
import { User } from "./models/user.model.js";
import { Patient } from "./models/patient.model.js";
import { Provider } from "./models/provider.model.js";
import { Plan } from "./models/plan.model.js";
import { WeightLog } from "./models/weightLog.model.js";
import { InjectionLog } from "./models/injectionLog.model.js";
import { Appointment } from "./models/appointment.model.js";

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB for seeding...");

    // Clear existing data
    await Promise.all([
      User.deleteMany({}),
      Patient.deleteMany({}),
      Provider.deleteMany({}),
      Plan.deleteMany({}),
      WeightLog.deleteMany({}),
      InjectionLog.deleteMany({}),
      Appointment.deleteMany({}),
    ]);
    console.log("Cleared existing data");

    // ── Create Provider (NP) ──
    const providerUser = await User.create({
      firstName: "Sarah",
      lastName: "Johnson",
      email: "sarah@hellodose.com",
      role: "provider",
      isActive: true,
      avatar: "https://i.pravatar.cc/150?u=sarah",
    });

    const provider = await Provider.create({
      user: providerUser._id,
      calcom_username: "waqas-anwar",
      calcom_event_slug: "30min",
      calcom_event_type_id: 1391696,
      calcom_schedule_id: 1433216,
      npi: "12345678899",
      title: "BOARD CERTIFIED FNP",
      vagaro_id: "vagaro_emp_001",
      npSince: new Date("2025-12-01"),
    });

    console.log(`Created provider: ${providerUser.email}`);

    // ── Create Patient 1 ──
    const patient1User = await User.create({
      firstName: "Natalia",
      lastName: "Ussher",
      email: "natalia@example.com",
      role: "patient",
      isActive: true,
    });

    const patient1 = await Patient.create({
      user: patient1User._id,
      vagaro_id: "vagaro_cust_001",
      age: 34,
      gender: "Female",
    });

    const plan1 = await Plan.create({
      patient: patient1User._id,
      assignedProvider: providerUser._id,
      name: "Tirzepatide",
      type: "weight-loss",
      startedAt: new Date("2025-10-01"),
      currentDosage: "2mg",
      targetWeightLoss: 40,
      startWeight: 210,
      lastReorderDate: new Date("2026-02-10"),
      nextRefillDate: new Date("2026-04-14"), // Eligible Today
      vagaro_id: "vagaro_svc_001",
      isActive: true,
    });

    const planPeptide = await Plan.create({
      patient: patient1User._id,
      assignedProvider: providerUser._id,
      name: "BPC-157",
      type: "peptide",
      startedAt: new Date("2026-01-01"),
      currentDosage: "500mcg",
      nextRefillDate: new Date("2026-05-15"),
      isActive: true,
    });


    // Weight logs for patient 1
    const weightDates = [
      { date: "2025-10-15", weight: 208 },
      { date: "2025-11-15", weight: 204 },
      { date: "2025-12-15", weight: 200 },
      { date: "2026-01-15", weight: 196 },
      { date: "2026-02-15", weight: 192 },
      { date: "2026-03-15", weight: 188 },
      { date: "2026-04-14", weight: 184.2 }, // Today
    ];

    for (const w of weightDates) {
      await WeightLog.create({
        patient: patient1User._id,
        weightLbs: w.weight,
        unitLogged: "lbs",
        loggedAt: new Date(w.date),
      });
    }

    // Injection logs for patient 1
    await InjectionLog.create({
      patient: patient1User._id,
      site: "R_ABDOMEN",
      dosage: "2mg",
      injectedAt: new Date("2026-04-13T14:30:00.000Z"), // Yesterday
      notes: "Slight redness after",
    });

    // Upcoming appointments for today (April 14, 2026)
    // Sarah's timezone: America/New_York
    const todayStr = "2026-04-14";

    // Natalia (Next Appointment)
    await Appointment.create({
      patient: patient1User._id,
      provider: providerUser._id,
      calBookingId: "cal_booking_natalia",
      startTime: new Date(`${todayStr}T17:00:00-04:00`), // 5:00 PM ET
      endTime: new Date(`${todayStr}T17:30:00-04:00`),
      meetingLink: "https://zoom.us/j/natalia-checkin",
      appointmentType: "Follow-up",
      status: "scheduled",
    });

    // ── Create Patient 3 (Liam Chen) ──
    const patient3User = await User.create({
      firstName: "Liam",
      lastName: "Chen",
      email: "liam@example.com",
      role: "patient",
      isActive: true,
    });

    await Patient.create({
      user: patient3User._id,
      vagaro_id: "vagaro_cust_003",
      age: 41,
      gender: "Male",
    });

    await WeightLog.create({
      patient: patient3User._id,
      weightLbs: 210.5,
      unitLogged: "lbs",
      loggedAt: new Date("2026-04-12"), // 2 days ago
    });

    await Appointment.create({
      patient: patient3User._id,
      provider: providerUser._id,
      calBookingId: "cal_booking_liam",
      startTime: new Date(`${todayStr}T18:00:00-04:00`), // 6:00 PM ET
      endTime: new Date(`${todayStr}T18:30:00-04:00`),
      meetingLink: "https://zoom.us/j/liam-intake",
      appointmentType: "Intake Assessment",
      status: "scheduled",
    });

    // ── Create Patient 4 (Jessica Wright) ──
    const patient4User = await User.create({
      firstName: "Jessica",
      lastName: "Wright",
      email: "jessica@example.com",
      role: "patient",
      isActive: true,
    });

    await Patient.create({
      user: patient4User._id,
      vagaro_id: "vagaro_cust_004",
      age: 29,
      gender: "Female",
    });

    await Plan.create({
      patient: patient4User._id,
      assignedProvider: providerUser._id,
      name: "Tirzepatide",
      type: "weight-loss",
      startedAt: new Date("2026-03-01"),
      currentDosage: "2.5mg",
      targetWeightLoss: 25,
      startWeight: 180,
      isActive: true,
    });

    await Appointment.create({
      patient: patient4User._id,
      provider: providerUser._id,
      calBookingId: "cal_booking_jessica",
      startTime: new Date(`${todayStr}T19:00:00-04:00`), // 7:00 PM ET
      endTime: new Date(`${todayStr}T19:30:00-04:00`),
      meetingLink: "https://zoom.us/j/jessica-reorder",
      appointmentType: "Meds Reorder",
      status: "scheduled",
    });

    console.log(`Created patients: ${patient1User.email}, ${patient3User.email}, ${patient4User.email} with today's appointments`);

    // ── Create Patient 2 ──
    const patient2User = await User.create({
      firstName: "James",
      lastName: "Wilson",
      email: "james@example.com",
      role: "patient",
      isActive: true,
    });

    const patient2 = await Patient.create({
      user: patient2User._id,
      vagaro_id: "vagaro_cust_002",
      age: 28,
      gender: "Male",
    });

    await Plan.create({
      patient: patient2User._id,
      assignedProvider: providerUser._id,
      name: "Semaglutide",
      type: "weight-loss",
      startedAt: new Date("2026-01-15"),
      currentDosage: "0.5mg",
      targetWeightLoss: 30,
      startWeight: 240,
      nextRefillDate: new Date("2026-04-19"),
      vagaro_id: "vagaro_svc_002",
      isActive: true,
    });


    await WeightLog.create({
      patient: patient2User._id,
      weightLbs: 198.4,
      unitLogged: "lbs",
      loggedAt: new Date("2026-04-07"), // 1 week ago
    });

    console.log(`Created patient: ${patient2User.email} with program`);

    // ── Summary ──
    console.log("\n--- Seed Complete ---");
    console.log("Provider login: sarah@hellodose.com");
    console.log("Patient 1 login: natalia@example.com");
    console.log("Patient 2 login: james@example.com");
    console.log("Patient 3 login: liam@example.com");
    console.log("Patient 4 login: jessica@example.com");
    console.log("Use POST /api/v1/auth/request-otp with any of these emails to get started\n");

    process.exit(0);
  } catch (error) {
    console.error("Seed error:", error);
    process.exit(1);
  }
};

seed();
