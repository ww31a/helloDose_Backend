import Joi from "joi";

export const createInjectionLogSchema = Joi.object({
  site: Joi.string()
    .valid("L_ABDOMEN", "R_ABDOMEN", "L_THIGH", "R_THIGH")
    .required(),
  injectedAt: Joi.date().iso().max("now").required(),
  notes: Joi.string().max(500).optional().allow(""),
});
