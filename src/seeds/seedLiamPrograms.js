/**
 * Seed script: Add Liam Chen to Tirzepatide and Semaglutide programs
 * Run: node --env-file=.env src/seeds/seedLiamPrograms.js
 */
import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

const UserSchema = new mongoose.Schema({ firstName: String, lastName: String });
const ProgramSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String,
  medication: String,
  startedAt: Date,
  currentDosage: String,
  targetWeightLoss: Number,
  startWeight: Number,
  followUpTiming: String,
  lastReorderDate: Date,
  nextRefillDate: Date,
  durationMonths: Number,
  type: String,
  isActive: Boolean,
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model("User", UserSchema);
const Program = mongoose.models.Program || mongoose.model("Program", ProgramSchema);

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB");

  const liam = await User.findOne({ firstName: "Liam", lastName: "Chen" });
  if (!liam) {
    console.log("Liam Chen not found in users collection.");
    process.exit(1);
  }
  console.log("Found Liam Chen:", liam._id.toString());

  // Check existing programs
  const existing = await Program.find({ patient: liam._id, isActive: true });
  console.log(`Liam has ${existing.length} active program(s):`, existing.map(p => p.name));

  // Create Tirzepatide if not exists
  const hasTirz = existing.find(p => p.name?.toLowerCase().includes("tirzepatide"));
  if (!hasTirz) {
    await Program.create({
      patient: liam._id,
      name: "Tirzepatide",
      medication: "Tirzepatide",
      startedAt: new Date("2025-11-15"),
      currentDosage: "2.5mg",
      targetWeightLoss: 30,
      startWeight: 210,
      lastReorderDate: new Date("2026-02-10"),
      nextRefillDate: new Date("2026-05-15"),
      durationMonths: 8,
      type: "weight-loss",
      isActive: true,
    });
    console.log("Created Tirzepatide program for Liam");
  } else {
    console.log("Liam already has Tirzepatide program");
  }

  // Create Semaglutide if not exists
  const hasSema = existing.find(p => p.name?.toLowerCase().includes("semaglutide"));
  if (!hasSema) {
    await Program.create({
      patient: liam._id,
      name: "Semaglutide",
      medication: "Semaglutide",
      startedAt: new Date("2025-12-01"),
      currentDosage: "1mg",
      targetWeightLoss: 25,
      startWeight: 210,
      lastReorderDate: new Date("2026-03-01"),
      nextRefillDate: new Date("2026-05-20"),
      durationMonths: 6,
      type: "weight-loss",
      isActive: true,
    });
    console.log("Created Semaglutide program for Liam");
  } else {
    console.log("Liam already has Semaglutide program");
  }

  const final = await Program.find({ patient: liam._id, isActive: true });
  console.log(`\nLiam now has ${final.length} active programs:`, final.map(p => p.name));

  await mongoose.disconnect();
  console.log("Done.");
}

main().catch(console.error);
