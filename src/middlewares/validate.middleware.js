import { ApiError } from "../utils/ApiError.js";

export const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const messages = error.details.map((d) => d.message).join(", ");
      throw new ApiError(400, messages);
    }

    if (!error) {
      // Clear existing keys to handle stripUnknown: true correctly
      for (const key in req.body) {
        delete req.body[key];
      }
      Object.assign(req.body, value);
    }
    next();
  };
};

export const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const messages = error.details.map((d) => d.message).join(", ");
      throw new ApiError(400, messages);
    }

    if (!error) {
      // req.query is a getter in Express 5, we must modify properties, not reassign
      for (const key in req.query) {
        delete req.query[key];
      }
      Object.assign(req.query, value);
    }
    next();
  };
};
