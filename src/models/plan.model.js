import mongoose from "mongoose";

const planSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assignedProvider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    name: { type: String, required: true },
    startedAt: { type: Date, required: true },
    currentDosage: { type: String, default: "" },
    targetWeightLoss: { type: Number },
    startWeight: { type: Number },
    followUpTiming: { type: String },
    lastReorderDate: { type: Date },
    nextRefillDate: { type: Date },
    vagaro_id: { type: String, index: true },
    durationMonths: { type: Number, default: 8 },
    type: {
      type: String,
      enum: ["weight-loss", "peptide"],
      default: "weight-loss",
    },
    frequency: { type: Number, default: 4 },
    onboardingInjectionsThisMonth: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Plan = mongoose.model("Plan", planSchema);
