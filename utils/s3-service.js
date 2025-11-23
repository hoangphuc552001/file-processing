const AWS = require('aws-sdk');

// Generate unique ID (fallback if uuid is not available)
function generateUniqueId() {
  try {
    const { v4: uuidv4 } = require('uuid');
    return uuidv4();
  } catch (e) {
    // Fallback to timestamp + random if uuid is not installed
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Configure AWS S3
const s3 = new AWS.S3({
  region: process.env.AWS_REGION || 'us-east-1',
  ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  } : {})
});

// S3 Bucket name from environment variable
const BUCKET_NAME = process.env.S3_BUCKET_NAME || '';

/**
 * Upload a file to S3
 * @param {Buffer} fileBuffer - The file buffer to upload
 * @param {String} fileName - Original file name
 * @param {String} mimeType - MIME type of the file
 * @param {String} folder - Optional folder prefix in S3
 * @returns {Promise<Object>} - Result object with success status and file URL
 */
async function uploadFile(fileBuffer, fileName, mimeType, folder = 'uploads') {
  try {
    // Validate bucket name
    if (!BUCKET_NAME) {
      console.error('❌ S3_BUCKET_NAME is not configured in environment variables');
      throw new Error('S3 Bucket name is not configured');
    }

    // Generate unique file name to avoid conflicts
    const fileExtension = fileName.split('.').pop();
    const uniqueFileName = `${generateUniqueId()}.${fileExtension}`;
    const key = folder ? `${folder}/${uniqueFileName}` : uniqueFileName;

    const params = {
      Bucket: BUCKET_NAME,
      Key: key,
      Body: fileBuffer,
      ContentType: mimeType,
      ACL: 'public-read',
      // Add metadata
      Metadata: {
        'original-name': fileName,
        'uploaded-at': new Date().toISOString()
      }
    };

    console.log('📤 Uploading file to S3:', {
      bucket: BUCKET_NAME,
      key: key,
      size: fileBuffer.length,
      contentType: mimeType
    });

    const result = await s3.upload(params).promise();

    console.log('✅ File uploaded successfully to S3:', {
      location: result.Location,
      key: result.Key,
      etag: result.ETag
    });

    return {
      success: true,
      url: result.Location,
      key: result.Key,
      bucket: BUCKET_NAME,
      etag: result.ETag,
      originalName: fileName
    };
  } catch (error) {
    console.error('❌ Failed to upload file to S3:', error);
    return {
      success: false,
      error: error.message || 'Failed to upload file to S3'
    };
  }
}

/**
 * Delete a file from S3
 * @param {String} key - The S3 key of the file to delete
 * @returns {Promise<Object>} - Result object with success status
 */
async function deleteFile(key) {
  try {
    if (!BUCKET_NAME) {
      throw new Error('S3 Bucket name is not configured');
    }

    const params = {
      Bucket: BUCKET_NAME,
      Key: key
    };

    console.log('🗑️ Deleting file from S3:', { bucket: BUCKET_NAME, key });

    await s3.deleteObject(params).promise();

    console.log('✅ File deleted successfully from S3:', { key });

    return {
      success: true,
      message: 'File deleted successfully'
    };
  } catch (error) {
    console.error('❌ Failed to delete file from S3:', error);
    return {
      success: false,
      error: error.message || 'Failed to delete file from S3'
    };
  }
}

/**
 * Get a presigned URL for file upload (client-side upload)
 * @param {String} fileName - Original file name
 * @param {String} mimeType - MIME type of the file
 * @param {Number} expiresIn - URL expiration time in seconds (default: 3600)
 * @param {String} folder - Optional folder prefix in S3
 * @returns {Promise<Object>} - Result object with presigned URL
 */
async function getPresignedUploadUrl(fileName, mimeType, expiresIn = 3600, folder = 'uploads') {
  try {
    if (!BUCKET_NAME) {
      throw new Error('S3 Bucket name is not configured');
    }

    const fileExtension = fileName.split('.').pop();
    const uniqueFileName = `${generateUniqueId()}.${fileExtension}`;
    const key = folder ? `${folder}/${uniqueFileName}` : uniqueFileName;

    const params = {
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: mimeType,
      Expires: expiresIn,
      ACL: 'public-read'
    };

    const url = await s3.getSignedUrlPromise('putObject', params);

    // Get region from AWS config
    const region = process.env.AWS_REGION || s3.config.region || 'us-east-1';

    return {
      success: true,
      url: url,
      key: key,
      bucket: BUCKET_NAME,
      region: region
    };
  } catch (error) {
    console.error('❌ Failed to generate presigned URL:', error);
    return {
      success: false,
      error: error.message || 'Failed to generate presigned URL'
    };
  }
}

/**
 * Get a presigned URL for file download
 * @param {String} key - The S3 key of the file
 * @param {Number} expiresIn - URL expiration time in seconds (default: 3600)
 * @returns {Promise<Object>} - Result object with presigned URL
 */
async function getPresignedDownloadUrl(key, expiresIn = 3600) {
  try {
    if (!BUCKET_NAME) {
      throw new Error('S3 Bucket name is not configured');
    }

    const params = {
      Bucket: BUCKET_NAME,
      Key: key,
      Expires: expiresIn
    };

    const url = await s3.getSignedUrlPromise('getObject', params);

    return {
      success: true,
      url: url,
      key: key
    };
  } catch (error) {
    console.error('❌ Failed to generate presigned download URL:', error);
    return {
      success: false,
      error: error.message || 'Failed to generate presigned download URL'
    };
  }
}

module.exports = {
  uploadFile,
  deleteFile,
  getPresignedUploadUrl,
  getPresignedDownloadUrl,
  BUCKET_NAME
};

