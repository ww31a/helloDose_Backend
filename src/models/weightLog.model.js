import mongoose from "mongoose";

const weightLogSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  weightLbs: { type: Number, required: true },
  unitLogged: { type: String, enum: ["lbs", "kg"], required: true },
  loggedAt: { type: Date, default: Date.now },
});

weightLogSchema.index({ patient: 1, loggedAt: -1 });

export const WeightLog = mongoose.model("WeightLog", weightLogSchema);
