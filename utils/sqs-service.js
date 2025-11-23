const AWS = require('aws-sdk');

// Configure AWS SQS
// Uses IAM role credentials automatically on EC2
// No need to set AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
const sqs = new AWS.SQS({
  region: process.env.AWS_REGION || 'us-east-1'
});

// SQS Queue URL from environment variable
const QUEUE_URL = process.env.SQS_QUEUE_URL || '';

/**
 * Send a message to SQS queue
 * @param {Object} message - The message object to send
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} - Result object with success status
 */
async function sendMessage(message, options = {}) {
  try {
    // Validate queue URL
    if (!QUEUE_URL) {
      console.error('❌ SQS_QUEUE_URL is not configured in environment variables');
      throw new Error('SQS Queue URL is not configured');
    }

    const params = {
      QueueUrl: QUEUE_URL,
      MessageBody: JSON.stringify(message),
      MessageAttributes: {
        MessageType: {
          DataType: 'String',
          StringValue: options.messageType || 'CourseCreation'
        },
        Timestamp: {
          DataType: 'String',
          StringValue: new Date().toISOString()
        }
      },
      // Optional delay in seconds (0-900)
      ...(options.delaySeconds && { DelaySeconds: options.delaySeconds })
    };

    // Add message group ID for FIFO queues
    if (options.messageGroupId) {
      params.MessageGroupId = options.messageGroupId;
    }

    // Add message deduplication ID for FIFO queues
    if (options.messageDeduplicationId) {
      params.MessageDeduplicationId = options.messageDeduplicationId;
    }

    console.log('📤 Sending message to SQS:', {
      queueUrl: QUEUE_URL,
      messageType: options.messageType || 'CourseCreation'
    });

    const result = await sqs.sendMessage(params).promise();

    console.log('✅ Message sent successfully to SQS:', {
      messageId: result.MessageId,
      md5: result.MD5OfMessageBody
    });

    return {
      success: true,
      messageId: result.MessageId,
      md5: result.MD5OfMessageBody
    };
  } catch (error) {
    console.error('❌ Failed to send message to SQS:', error);
    return {
      success: false,
      error: error.message || 'Failed to send message to SQS'
    };
  }
}

/**
 * Send a batch of messages to SQS queue
 * @param {Array<Object>} messages - Array of message objects
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} - Result object with success status
 */
async function sendBatchMessages(messages, options = {}) {
  try {
    if (!QUEUE_URL) {
      throw new Error('SQS Queue URL is not configured');
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('Messages must be a non-empty array');
    }

    if (messages.length > 10) {
      throw new Error('Cannot send more than 10 messages in a batch');
    }

    const entries = messages.map((message, index) => ({
      Id: `msg-${index}`,
      MessageBody: JSON.stringify(message),
      MessageAttributes: {
        MessageType: {
          DataType: 'String',
          StringValue: options.messageType || 'CourseCreation'
        },
        Timestamp: {
          DataType: 'String',
          StringValue: new Date().toISOString()
        }
      }
    }));

    const params = {
      QueueUrl: QUEUE_URL,
      Entries: entries
    };

    console.log(`📤 Sending batch of ${messages.length} messages to SQS`);

    const result = await sqs.sendMessageBatch(params).promise();

    console.log('✅ Batch messages sent successfully:', {
      successful: result.Successful?.length || 0,
      failed: result.Failed?.length || 0
    });

    return {
      success: true,
      successful: result.Successful || [],
      failed: result.Failed || []
    };
  } catch (error) {
    console.error('❌ Failed to send batch messages to SQS:', error);
    return {
      success: false,
      error: error.message || 'Failed to send batch messages to SQS'
    };
  }
}

/**
 * Get the approximate number of messages in the queue
 * @returns {Promise<Object>} - Result with queue attributes
 */
async function getQueueAttributes() {
  try {
    if (!QUEUE_URL) {
      throw new Error('SQS Queue URL is not configured');
    }

    const params = {
      QueueUrl: QUEUE_URL,
      AttributeNames: [
        'ApproximateNumberOfMessages',
        'ApproximateNumberOfMessagesNotVisible',
        'ApproximateNumberOfMessagesDelayed'
      ]
    };

    const result = await sqs.getQueueAttributes(params).promise();

    return {
      success: true,
      attributes: result.Attributes
    };
  } catch (error) {
    console.error('❌ Failed to get queue attributes:', error);
    return {
      success: false,
      error: error.message || 'Failed to get queue attributes'
    };
  }
}

module.exports = {
  sendMessage,
  sendBatchMessages,
  getQueueAttributes,
  QUEUE_URL
};

