import mongoose from "mongoose";

const patientSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    assignedProvider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    vagaro_id: { type: String, index: true },
    program: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Program",
    },
    age: { type: Number },
    gender: { type: String },
    cardBrand: { type: String, default: "" },
    cardLast4: { type: String, default: "" },
    npCheckinDate: { type: Date },
  },
  { timestamps: true }
);

export const Patient = mongoose.model("Patient", patientSchema);
