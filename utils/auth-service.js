const { cognitoISP, cognitoConfig } = require('./cognito-config');
const crypto = require('crypto');

class AuthService {
  /**
   * Calculate SECRET_HASH for Cognito requests
   * @param {string} username - Username
   * @returns {string} - Base64 encoded SECRET_HASH
   */
  calculateSecretHash(username) {
    if (!cognitoConfig.ClientSecret) {
      return null; // No secret configured
    }

    const message = username + cognitoConfig.ClientId;
    const hmac = crypto.createHmac('sha256', cognitoConfig.ClientSecret);
    hmac.update(message);
    return hmac.digest('base64');
  }
  /**
   * Sign up a new user
   * @param {string} username - User's username
   * @param {string} email - User's email
   * @param {string} password - User's password
   * @returns {Promise<Object>} - Sign up result
   */
  async signUp(username, email, password) {
    try {
      const params = {
        ClientId: cognitoConfig.ClientId,
        Username: username,
        Password: password,
        UserAttributes: [
          {
            Name: 'email',
            Value: email
          },
          {
            Name: 'preferred_username',
            Value: username
          }
        ]
      };

      // Add SECRET_HASH if client secret is configured
      const secretHash = this.calculateSecretHash(username);
      if (secretHash) {
        params.SecretHash = secretHash;
      }

      const result = await cognitoISP.signUp(params).promise();
      return {
        success: true,
        userSub: result.UserSub,
        codeDeliveryDetails: result.CodeDeliveryDetails
      };
    } catch (error) {
      console.error('Sign up error:', error);
      return {
        success: false,
        error: error.message || 'Sign up failed'
      };
    }
  }

  /**
   * Confirm user sign up with verification code
   * @param {string} username - User's username
   * @param {string} code - Verification code
   * @returns {Promise<Object>} - Confirmation result
   */
  async confirmSignUp(username, code) {
    try {
      const params = {
        ClientId: cognitoConfig.ClientId,
        Username: username,
        ConfirmationCode: code
      };

      // Add SECRET_HASH if client secret is configured
      const secretHash = this.calculateSecretHash(username);
      if (secretHash) {
        params.SecretHash = secretHash;
      }

      await cognitoISP.confirmSignUp(params).promise();
      return {
        success: true,
        message: 'Email verified successfully'
      };
    } catch (error) {
      console.error('Confirm sign up error:', error);
      return {
        success: false,
        error: error.message || 'Email verification failed'
      };
    }
  }

  /**
   * Resend verification code
   * @param {string} username - User's username
   * @returns {Promise<Object>} - Resend result
   */
  async resendConfirmationCode(username) {
    try {
      const params = {
        ClientId: cognitoConfig.ClientId,
        Username: username
      };

      // Add SECRET_HASH if client secret is configured
      const secretHash = this.calculateSecretHash(username);
      if (secretHash) {
        params.SecretHash = secretHash;
      }

      const result = await cognitoISP.resendConfirmationCode(params).promise();
      return {
        success: true,
        codeDeliveryDetails: result.CodeDeliveryDetails
      };
    } catch (error) {
      console.error('Resend confirmation code error:', error);
      return {
        success: false,
        error: error.message || 'Failed to resend verification code'
      };
    }
  }

  /**
   * Sign in user
   * @param {string} username - User's username
   * @param {string} password - User's password
   * @returns {Promise<Object>} - Sign in result
   */
  async signIn(username, password) {
    try {
      const params = {
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: cognitoConfig.ClientId,
        AuthParameters: {
          USERNAME: username,
          PASSWORD: password
        }
      };

      // Add SECRET_HASH if client secret is configured
      const secretHash = this.calculateSecretHash(username);
      if (secretHash) {
        params.AuthParameters.SECRET_HASH = secretHash;
      }

      const result = await cognitoISP.initiateAuth(params).promise();
      
      if (result.AuthenticationResult) {
        return {
          success: true,
          accessToken: result.AuthenticationResult.AccessToken,
          idToken: result.AuthenticationResult.IdToken,
          refreshToken: result.AuthenticationResult.RefreshToken,
          expiresIn: result.AuthenticationResult.ExpiresIn
        };
      } else {
        return {
          success: false,
          error: 'Authentication failed'
        };
      }
    } catch (error) {
      console.error('Sign in error:', error);
      return {
        success: false,
        error: error.message || 'Sign in failed'
      };
    }
  }

  /**
   * Sign out user
   * @param {string} accessToken - User's access token
   * @returns {Promise<Object>} - Sign out result
   */
  async signOut(accessToken) {
    try {
      const params = {
        AccessToken: accessToken
      };

      await cognitoISP.globalSignOut(params).promise();
      return {
        success: true,
        message: 'Signed out successfully'
      };
    } catch (error) {
      console.error('Sign out error:', error);
      return {
        success: false,
        error: error.message || 'Sign out failed'
      };
    }
  }

  /**
   * Get user information
   * @param {string} accessToken - User's access token
   * @returns {Promise<Object>} - User information
   */
  async getUserInfo(accessToken) {
    try {
      const params = {
        AccessToken: accessToken
      };

      const result = await cognitoISP.getUser(params).promise();
      
      const userInfo = {};
      result.UserAttributes.forEach(attr => {
        userInfo[attr.Name] = attr.Value;
      });

      return {
        success: true,
        user: userInfo
      };
    } catch (error) {
      console.error('Get user info error:', error);
      return {
        success: false,
        error: error.message || 'Failed to get user information'
      };
    }
  }

  /**
   * Refresh access token
   * @param {string} refreshToken - User's refresh token
   * @returns {Promise<Object>} - Token refresh result
   */
  async refreshToken(refreshToken) {
    try {
      // For refresh token, we need a username placeholder for SECRET_HASH calculation
      // Cognito doesn't require it for refresh, but if secret is configured, we need to handle it
      const params = {
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        ClientId: cognitoConfig.ClientId,
        AuthParameters: {
          REFRESH_TOKEN: refreshToken
        }
      };

      const result = await cognitoISP.initiateAuth(params).promise();
      
      if (result.AuthenticationResult) {
        return {
          success: true,
          accessToken: result.AuthenticationResult.AccessToken,
          idToken: result.AuthenticationResult.IdToken,
          expiresIn: result.AuthenticationResult.ExpiresIn
        };
      } else {
        return {
          success: false,
          error: 'Token refresh failed'
        };
      }
    } catch (error) {
      console.error('Refresh token error:', error);
      return {
        success: false,
        error: error.message || 'Token refresh failed'
      };
    }
  }

  /**
   * Verify JWT token
   * @param {string} token - JWT token to verify
   * @returns {Promise<Object>} - Token verification result
   */
  async verifyToken(token) {
    try {
      const params = {
        AccessToken: token
      };

      const result = await cognitoISP.getUser(params).promise();
      return {
        success: true,
        user: result
      };
    } catch (error) {
      console.error('Token verification error:', error);
      return {
        success: false,
        error: error.message || 'Token verification failed'
      };
    }
  }
}

module.exports = new AuthService();
