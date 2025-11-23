const authService = require('../utils/auth-service');

/**
 * Authentication middleware to verify JWT tokens
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token required'
      });
    }

    const result = await authService.verifyToken(token);
    
    if (!result.success) {
      return res.status(403).json({
        success: false,
        error: result.error || 'Invalid token'
      });
    }

    // Add user info to request object
    req.user = result.user;
    req.accessToken = token;
    next();
  } catch (error) {
    console.error('Authentication middleware error:', error);
    return res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};

/**
 * Optional authentication middleware - doesn't fail if no token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const result = await authService.verifyToken(token);
      if (result.success) {
        req.user = result.user;
        req.accessToken = token;
      }
    }
    
    next();
  } catch (error) {
    console.error('Optional authentication middleware error:', error);
    next(); // Continue even if auth fails
  }
};

module.exports = {
  authenticateToken,
  optionalAuth
};
