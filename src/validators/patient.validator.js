import Joi from "joi";

// No patient-creation endpoints in MVP — patients are pre-created
// This file holds any patient-specific request validators needed

export const updateDeviceTokenSchema = Joi.object({
  deviceToken: Joi.string().required(),
});
