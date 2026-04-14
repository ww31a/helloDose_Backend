/**
 * Role-based Access Control Middleware
 * Checks user role and permissions
 */

const roleMiddleware = (...allowedRoles) => {
  return (req, res, next) => {
    // TODO: Implement role checking logic
    // - Check if req.user exists
    // - Verify req.user.role is in allowedRoles
    // - Return 403 if unauthorized
    next();
  };
};

module.exports = roleMiddleware;
