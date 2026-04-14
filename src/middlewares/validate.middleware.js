/**
 * Request Validation Middleware
 * Validates request body, params, and query using schemas
 */

const validateMiddleware = (schema, location = 'body') => {
  return (req, res, next) => {
    // TODO: Implement validation logic
    // - Use schema to validate request data
    // - Location can be 'body', 'params', or 'query'
    // - Return 400 if validation fails
    next();
  };
};

module.exports = validateMiddleware;
