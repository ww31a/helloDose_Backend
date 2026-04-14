import Joi from "joi";

export const createWeightLogSchema = Joi.object({
  weight: Joi.number().positive().precision(3).required(),
  unit: Joi.string().valid("lbs", "kg").required(),
});
