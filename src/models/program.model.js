import mongoose from "mongoose";

const programSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: { type: String, required: true },
    medication: {
      type: String,
      enum: ["tirzepatide", "semaglutide"],
      required: true,
    },
    startedAt: { type: Date, required: true },
    currentDosage: { type: String, default: "" },
    targetWeightLoss: { type: Number },
    startWeight: { type: Number },
    lastReorderDate: { type: Date },
    nextRefillDate: { type: Date },
    vagaro_id: { type: String, index: true },
    durationMonths: { type: Number, default: 8 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Program = mongoose.model("Program", programSchema);
