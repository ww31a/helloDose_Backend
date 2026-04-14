import Joi from "joi";

export const getSlotsSchema = Joi.object({
  providerId: Joi.string().required(),
  date: Joi.date().iso().required(),
});

export const bookAppointmentSchema = Joi.object({
  providerId: Joi.string().required(),
  startTime: Joi.date().iso().required(),
});
