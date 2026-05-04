import Joi from "joi";

export const getSlotsSchema = Joi.object({
  providerId: Joi.string().required(),
  date: Joi.date().iso().optional(),
  days: Joi.number().integer().min(1).max(90).optional(),
});

export const bookAppointmentSchema = Joi.object({
  providerId: Joi.string().required(),
  startTime: Joi.date().iso().required(),
});
