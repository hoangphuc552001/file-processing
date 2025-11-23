const AWS = require('aws-sdk');
const { CognitoIdentityProviderClient } = require('@aws-sdk/client-cognito-identity-provider');
const { Issuer } = require('openid-client');

// Validate required environment variables
const requiredEnvVars = {
  AWS_REGION: process.env.AWS_REGION,
  COGNITO_USER_POOL_ID: process.env.COGNITO_USER_POOL_ID,
  COGNITO_CLIENT_ID: process.env.COGNITO_CLIENT_ID
};

// Check for missing required variables
const missingVars = Object.entries(requiredEnvVars)
  .filter(([key, value]) => !value)
  .map(([key]) => key);

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingVars.join(', '));
  console.error('Please create a .env file with the required variables.');
}

// Configure AWS SDK
// Uses IAM role credentials automatically on EC2
// No need to set AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
const awsConfig = {
  region: process.env.AWS_REGION || 'us-east-1'
};

AWS.config.update(awsConfig);
console.log('Using AWS IAM role credentials (EC2) or default credential chain');

// Cognito configuration with defaults for development
const cognitoConfig = {
  UserPoolId: process.env.COGNITO_USER_POOL_ID || 'us-east-1_mhu6JL75g',
  ClientId: process.env.COGNITO_CLIENT_ID || '3pgi8im0do3ahfdqc17vgpujqb',
  ClientSecret: process.env.COGNITO_CLIENT_SECRET,
  Region: process.env.AWS_REGION || 'us-east-1',
  IssuerUrl: process.env.COGNITO_ISSUER_URL || `https://cognito-idp.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID || 'us-east-1_mhu6JL75g'}`,
  RedirectUri: process.env.COGNITO_REDIRECT_URI || 'https://d84l1y8p4kdic.cloudfront.net',
  ResponseTypes: ['code']
};

// Initialize Cognito Identity Provider client
// Uses IAM role credentials automatically on EC2
const cognitoClient = new CognitoIdentityProviderClient({
  region: cognitoConfig.Region
});

// Initialize Cognito Identity Service Provider (for older SDK compatibility)
const cognitoISP = new AWS.CognitoIdentityServiceProvider({
  region: cognitoConfig.Region
});

// OIDC Client - will be initialized asynchronously
let oidcClient = null;

/**
 * Initialize OpenID Connect Client
 * @returns {Promise<Object>} - OIDC client
 */
async function initializeOIDCClient() {
  if (oidcClient) {
    return oidcClient;
  }

  try {
    // Validate required configuration
    if (!cognitoConfig.IssuerUrl) {
      throw new Error('COGNITO_ISSUER_URL is not configured. Please set it in your .env file.');
    }

    console.log('Initializing OIDC client with issuer:', cognitoConfig.IssuerUrl);
    
    const issuer = await Issuer.discover(cognitoConfig.IssuerUrl);
    
    oidcClient = new issuer.Client({
      client_id: cognitoConfig.ClientId,
      client_secret: cognitoConfig.ClientSecret,
      redirect_uris: [cognitoConfig.RedirectUri],
      response_types: cognitoConfig.ResponseTypes
    });

    console.log('✅ OIDC Client initialized successfully');
    return oidcClient;
  } catch (error) {
    console.error('❌ Failed to initialize OIDC client:', error.message);
    console.error('Please check your Cognito configuration in .env file');
    throw error;
  }
}

/**
 * Get OIDC Client (initialize if needed)
 * @returns {Promise<Object>} - OIDC client
 */
async function getOIDCClient() {
  if (!oidcClient) {
    return await initializeOIDCClient();
  }
  return oidcClient;
}

module.exports = {
  cognitoConfig,
  cognitoClient,
  cognitoISP,
  initializeOIDCClient,
  getOIDCClient
};
