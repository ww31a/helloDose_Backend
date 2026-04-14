// models/appointment.model.js
const appointmentSchema = new mongoose.Schema({
  patient:      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  provider:     { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  calBookingId: { type: String, index: true },
  startTime:    { type: Date, required: true },
  endTime:      { type: Date },
  meetingLink:  { type: String },
  status: {
    type: String,
    enum: ["scheduled", "rescheduled", "cancelled", "completed"],
    default: "scheduled",
  },
  reminderSent: { type: Boolean, default: false },
}, { timestamps: true });