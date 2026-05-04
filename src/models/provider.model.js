import mongoose from "mongoose";

const providerSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    calcom_username: { type: String },
    calcom_event_slug: { type: String },
    calcom_event_type_id: { type: Number },
    calcom_schedule_id: { type: Number },
    npi: { type: String },
    title: { type: String, default: "Board Certified FNP" },
    vagaro_id: { type: String, index: true },
    npSince: { type: Date },
    availability: [
      {
        day: {
          type: String,
          enum: [
            "sunday",
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
          ],
        },
        enabled: { type: Boolean, default: false },
        slots: [
          {
            start: { type: String },
            end: { type: String },
          },
        ],
      },
    ],
  },
  { timestamps: true }
);

export const Provider = mongoose.model("Provider", providerSchema);
