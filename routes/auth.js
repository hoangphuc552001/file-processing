const express = require('express');
const authService = require('../utils/auth-service');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

/**
 * @route POST /auth/signup
 * @desc Register a new user
 * @access Public
 */
router.post('/signup', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validate required fields
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username, email, and password are required'
      });
    }

    // Validate username format
    if (username.length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Username must be at least 3 characters long'
      });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({
        success: false,
        error: 'Username can only contain letters, numbers, and underscores'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    // Validate password strength
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters long'
      });
    }

    const result = await authService.signUp(username, email, password);
    
    if (result.success) {
      res.status(201).json({
        success: true,
        message: 'User registered successfully.',
        userSub: result.userSub
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * @route POST /auth/verify-email
 * @desc Verify user email with confirmation code
 * @access Public
 */
router.post('/verify-email', async (req, res) => {
  try {
    const { username, code } = req.body;

    // Validate required fields
    if (!username || !code) {
      return res.status(400).json({
        success: false,
        error: 'Username and verification code are required'
      });
    }

    const result = await authService.confirmSignUp(username, code);
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * @route POST /auth/resend-verification
 * @desc Resend verification code
 * @access Public
 */
router.post('/resend-verification', async (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'Username is required'
      });
    }

    const result = await authService.resendConfirmationCode(username);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Verification code resent successfully',
        codeDeliveryDetails: result.codeDeliveryDetails
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * @route POST /auth/signin
 * @desc Sign in user
 * @access Public
 */
router.post('/signin', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate required fields
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
    }

    const result = await authService.signIn(username, password);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Sign in successful',
        accessToken: result.accessToken,
        idToken: result.idToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn
      });
    } else {
      res.status(401).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Signin error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * @route POST /auth/logout
 * @desc Sign out user
 * @access Private
 */
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const result = await authService.signOut(req.accessToken);
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * @route GET /auth/me
 * @desc Get current user information
 * @access Private
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await authService.getUserInfo(req.accessToken);
    
    if (result.success) {
      res.json({
        success: true,
        user: result.user
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Get user info error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * @route POST /auth/refresh
 * @desc Refresh access token
 * @access Public
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token is required'
      });
    }

    const result = await authService.refreshToken(refreshToken);
    
    if (result.success) {
      res.json({
        success: true,
        accessToken: result.accessToken,
        idToken: result.idToken,
        expiresIn: result.expiresIn
      });
    } else {
      res.status(401).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * @route POST /auth/verify-token
 * @desc Verify if token is valid
 * @access Public
 */
router.post('/verify-token', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Token is required'
      });
    }

    const result = await authService.verifyToken(token);
    
    if (result.success) {
      res.json({
        success: true,
        valid: true,
        user: result.user
      });
    } else {
      res.json({
        success: true,
        valid: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

module.exports = router;
