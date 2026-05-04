import Joi from "joi";

export const requestCheckinSchema = Joi.object({
  patientId: Joi.string().required(),
});
