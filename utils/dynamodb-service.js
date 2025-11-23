const AWS = require('aws-sdk');

// Configure AWS DynamoDB
// Uses IAM role credentials automatically on EC2
// No need to set AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.AWS_REGION || 'us-east-1'
});

// DynamoDB Table name from environment variable
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'MediaJobs';

/**
 * Get file metadata from MediaJobs table by S3 key
 * @param {String} s3Key - The S3 key of the file
 * @returns {Promise<Object>} - Result object with file metadata
 */
async function getFileMetadata(s3Key) {
  try {
    if (!TABLE_NAME) {
      throw new Error('DynamoDB table name is not configured');
    }

    // Query by S3 key - adjust the key name based on your table structure
    // Common patterns: 's3Key', 's3_key', 'fileKey', 'key', 's3Path', 'inputS3Key', 'outputS3Key'
    // Try multiple possible attribute names
    const possibleKeyAttributes = ['s3Key', 's3_key', 'fileKey', 'key', 's3Path', 'inputS3Key', 'outputS3Key', 'inputKey', 'outputKey'];
    
    // Build filter expression for all possible attributes
    const filterParts = possibleKeyAttributes.map((attr, index) => {
      const attrName = attr.includes('_') ? `#attr${index}` : attr;
      return `contains(${attrName}, :key)`;
    }).join(' OR ');
    
    const expressionAttributeNames = {};
    possibleKeyAttributes.forEach((attr, index) => {
      if (attr.includes('_') || attr === 'key') {
        expressionAttributeNames[`#attr${index}`] = attr;
      }
    });
    if (!expressionAttributeNames['#key']) {
      expressionAttributeNames['#key'] = 'key';
    }

    const params = {
      TableName: TABLE_NAME,
      FilterExpression: filterParts,
      ExpressionAttributeValues: {
        ':key': s3Key
      },
      ExpressionAttributeNames: expressionAttributeNames
    };

    console.log('🔍 Querying DynamoDB for file metadata:', {
      table: TABLE_NAME,
      s3Key: s3Key
    });

    const result = await dynamodb.scan(params).promise();

    if (result.Items && result.Items.length > 0) {
      // Return the first matching item (or you might want to return all)
      console.log('✅ Found file metadata in DynamoDB');
      return {
        success: true,
        metadata: result.Items[0],
        allItems: result.Items
      };
    }

    // If scan doesn't find it, try querying by different attributes
    // Try querying by exact match if there's a primary key or GSI
    const queryParams = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 's3Key = :key',
      ExpressionAttributeValues: {
        ':key': s3Key
      }
    };

    try {
      const queryResult = await dynamodb.query(queryParams).promise();
      if (queryResult.Items && queryResult.Items.length > 0) {
        console.log('✅ Found file metadata in DynamoDB (via query)');
        return {
          success: true,
          metadata: queryResult.Items[0],
          allItems: queryResult.Items
        };
      }
    } catch (queryError) {
      // Query might fail if the key doesn't exist as a primary key or GSI
      console.log('Query by key failed, using scan result');
    }

    console.log('⚠️ No metadata found in DynamoDB for key:', s3Key);
    return {
      success: false,
      metadata: null,
      error: 'No metadata found for this file'
    };

  } catch (error) {
    console.error('❌ Failed to get file metadata from DynamoDB:', error);
    return {
      success: false,
      metadata: null,
      error: error.message || 'Failed to get file metadata'
    };
  }
}

/**
 * Get file metadata by job ID (if MediaJobs table uses jobId as primary key)
 * @param {String} jobId - The job ID
 * @returns {Promise<Object>} - Result object with file metadata
 */
async function getFileMetadataByJobId(jobId) {
  try {
    if (!TABLE_NAME) {
      throw new Error('DynamoDB table name is not configured');
    }

    const params = {
      TableName: TABLE_NAME,
      Key: {
        jobId: jobId
      }
    };

    console.log('🔍 Querying DynamoDB by job ID:', {
      table: TABLE_NAME,
      jobId: jobId
    });

    const result = await dynamodb.get(params).promise();

    if (result.Item) {
      console.log('✅ Found file metadata in DynamoDB');
      return {
        success: true,
        metadata: result.Item
      };
    }

    return {
      success: false,
      metadata: null,
      error: 'No metadata found for this job ID'
    };

  } catch (error) {
    console.error('❌ Failed to get file metadata from DynamoDB:', error);
    return {
      success: false,
      metadata: null,
      error: error.message || 'Failed to get file metadata'
    };
  }
}

/**
 * Get all file metadata from MediaJobs table
 * @param {Number} limit - Maximum number of items to return (default: 100)
 * @returns {Promise<Object>} - Result object with all file metadata
 */
async function getAllFileMetadata(limit = 100) {
  try {
    if (!TABLE_NAME) {
      throw new Error('DynamoDB table name is not configured');
    }

    const params = {
      TableName: TABLE_NAME,
      Limit: limit
    };

    console.log('🔍 Scanning DynamoDB table for all metadata:', {
      table: TABLE_NAME,
      limit: limit
    });

    const result = await dynamodb.scan(params).promise();

    return {
      success: true,
      items: result.Items || [],
      count: result.Count || 0,
      scannedCount: result.ScannedCount || 0
    };

  } catch (error) {
    console.error('❌ Failed to get file metadata from DynamoDB:', error);
    return {
      success: false,
      items: [],
      error: error.message || 'Failed to get file metadata'
    };
  }
}

/**
 * Wait for metadata to appear in DynamoDB (polling)
 * Useful when file processing is asynchronous
 * @param {String} s3Key - The S3 key to wait for
 * @param {Number} maxWaitTime - Maximum time to wait in milliseconds (default: 30000)
 * @param {Number} pollInterval - Polling interval in milliseconds (default: 1000)
 * @returns {Promise<Object>} - Result object with file metadata
 */
async function waitForFileMetadata(s3Key, maxWaitTime = 30000, pollInterval = 1000) {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    const result = await getFileMetadata(s3Key);
    
    if (result.success && result.metadata) {
      return result;
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  return {
    success: false,
    metadata: null,
    error: 'Timeout waiting for file metadata'
  };
}

module.exports = {
  getFileMetadata,
  getFileMetadataByJobId,
  getAllFileMetadata,
  waitForFileMetadata,
  TABLE_NAME
};

