/**
 * Authentication Middleware
 * Verifies JWT tokens and attaches user info to request
 */

const authMiddleware = (req, res, next) => {
  // TODO: Implement authentication logic
  // - Extract token from headers
  // - Verify token
  // - Attach user to req.user
  next();
};

module.exports = authMiddleware;
