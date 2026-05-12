import mongoose from "mongoose";

const injectionLogSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  plan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Plan",
    required: true,
  },
  medication: {
    type: String,
    required: true,
  },
  site: {
    type: String,
    enum: ["L_ABDOMEN", "R_ABDOMEN", "L_THIGH", "R_THIGH"],
    required: true,
  },
  dosage: { type: String, default: "" },
  injectedAt: { type: Date, required: true },
  notes: { type: String, maxlength: 500, default: "" },
});

injectionLogSchema.index({ patient: 1, injectedAt: -1 });

export const InjectionLog = mongoose.model("InjectionLog", injectionLogSchema);
