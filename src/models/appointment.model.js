import mongoose from "mongoose";

const appointmentSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    vagaro_appointment_id: { type: String, unique: true, sparse: true, index: true },
    serviceId: { type: String },
    cal_booking_id: { type: String, index: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date },
    meetingLink: { type: String },
    status: {
      type: String,
      enum: ["scheduled", "rescheduled", "cancelled", "completed", "no_show"],
      default: "scheduled",
    },
    appointmentType: {
      type: String,
      enum: ["Follow-up", "Intake Assessment", "Meds Reorder", "Meds Consultation", "Other"],
      default: "Follow-up",
    },
    reminderSent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Appointment = mongoose.model("Appointment", appointmentSchema);