import mongoose from "mongoose";

/**
 * ServiceCatalog — stores Hello Dose services fetched from Vagaro.
 * This is a reference catalog, not patient-specific.
 * Keyed by vagaro_service_id for idempotent upserts.
 */
const serviceCatalogSchema = new mongoose.Schema(
  {
    vagaro_service_id:    { type: String, required: true, unique: true, index: true },
    vagaro_parent_id:     { type: String, index: true },
    parentTitle:          { type: String },
    title:                { type: String, required: true },
    type:                 { type: String },           // "Service" | "AddOn"
    businessCost:         { type: Number },
    currency:             { type: String, default: "USD" },
    showOnlineStatus:     { type: String },
    serviceDescription:   { type: String, default: "" },
    // Which providers can perform this service
    serviceProviders: [
      {
        vagaro_provider_id:   { type: String },
        providerName:         { type: String },
        price:                { type: Number },
        durationMinutes:      { type: Number },
      },
    ],
  },
  { timestamps: true }
);

export const ServiceCatalog = mongoose.model("ServiceCatalog", serviceCatalogSchema);
