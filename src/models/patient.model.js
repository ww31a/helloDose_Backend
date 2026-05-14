import mongoose from "mongoose";

const patientSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    vagaro_id: { type: String, index: true },
    plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Plan",
    },
    age: { type: Number },
    gender: { type: String },
    height: { type: String },
    primaryGoal: { type: String },
    npCheckinDate: { type: Date },
    onboardingProgress: {
      photoCompleted: { type: Boolean, default: false },
      plansCompleted: { type: Boolean, default: false },
      startWeightCompleted: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

export const Patient = mongoose.model("Patient", patientSchema);
