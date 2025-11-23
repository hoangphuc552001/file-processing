const express = require('express');
const multer = require('multer');
const { authenticateToken } = require('../middleware/auth');
const { uploadFile, deleteFile, getPresignedUploadUrl } = require('../utils/s3-service');
const router = express.Router();

// Configure multer for memory storage (we'll upload directly to S3)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept all file types, but you can add restrictions here
    // For example, only images: ['image/jpeg', 'image/png', 'image/gif']
    cb(null, true);
  }
});

/**
 * @route POST /api/files/upload
 * @desc Upload a file to S3
 * @access Private (requires authentication)
 */
router.post('/upload', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file provided'
      });
    }

    const { originalname, mimetype, buffer, size } = req.file;
    const folder = req.body.folder || 'uploads'; // Optional folder parameter

    // Validate file size (additional check)
    if (size > 10 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        error: 'File size exceeds 10MB limit'
      });
    }

    // Upload to S3
    const uploadResult = await uploadFile(buffer, originalname, mimetype, folder);

    if (!uploadResult.success) {
      return res.status(500).json({
        success: false,
        error: uploadResult.error || 'Failed to upload file'
      });
    }

    console.log('✅ File uploaded successfully:', {
      fileName: originalname,
      url: uploadResult.url,
      uploadedBy: req.user?.username || req.user?.sub || 'unknown'
    });

    res.status(200).json({
      success: true,
      message: 'File uploaded successfully',
      file: {
        url: uploadResult.url,
        key: uploadResult.key,
        originalName: uploadResult.originalName,
        size: size,
        mimeType: mimetype,
        uploadedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error uploading file:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload file',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route POST /api/files/upload-multiple
 * @desc Upload multiple files to S3
 * @access Private (requires authentication)
 */
router.post('/upload-multiple', authenticateToken, upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files provided'
      });
    }

    const folder = req.body.folder || 'uploads';
    const uploadResults = [];
    const errors = [];

    // Upload each file
    for (const file of req.files) {
      const { originalname, mimetype, buffer, size } = file;

      if (size > 10 * 1024 * 1024) {
        errors.push({
          fileName: originalname,
          error: 'File size exceeds 10MB limit'
        });
        continue;
      }

      const uploadResult = await uploadFile(buffer, originalname, mimetype, folder);

      if (uploadResult.success) {
        uploadResults.push({
          url: uploadResult.url,
          key: uploadResult.key,
          originalName: uploadResult.originalName,
          size: size,
          mimeType: mimetype
        });
      } else {
        errors.push({
          fileName: originalname,
          error: uploadResult.error
        });
      }
    }

    console.log('✅ Multiple files upload completed:', {
      successful: uploadResults.length,
      failed: errors.length,
      uploadedBy: req.user?.username || req.user?.sub || 'unknown'
    });

    res.status(200).json({
      success: uploadResults.length > 0,
      message: `Uploaded ${uploadResults.length} file(s) successfully`,
      files: uploadResults,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('❌ Error uploading multiple files:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload files',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route POST /api/files/presigned-url
 * @desc Generate a presigned URL for direct client-side upload to S3
 * @access Private (requires authentication)
 */
router.post('/presigned-url', authenticateToken, async (req, res) => {
  try {
    const { fileName, mimeType, folder } = req.body;

    // Validate required fields
    if (!fileName || !mimeType) {
      return res.status(400).json({
        success: false,
        error: 'File name and MIME type are required'
      });
    }

    // Validate file size (check file size if provided)
    // Note: Actual file size validation should be done on client side before requesting URL
    const folderPath = folder || 'uploads';
    const expiresIn = 3600; // 1 hour

    // Generate presigned URL
    const presignedResult = await getPresignedUploadUrl(fileName, mimeType, expiresIn, folderPath);

    if (!presignedResult.success) {
      return res.status(500).json({
        success: false,
        error: presignedResult.error || 'Failed to generate presigned URL'
      });
    }

    console.log('✅ Presigned URL generated:', {
      fileName: fileName,
      key: presignedResult.key,
      generatedBy: req.user?.username || req.user?.sub || 'unknown'
    });

    res.status(200).json({
      success: true,
      uploadUrl: presignedResult.url,
      key: presignedResult.key,
      bucket: presignedResult.bucket,
      region: presignedResult.region,
      expiresIn: expiresIn
    });

  } catch (error) {
    console.error('❌ Error generating presigned URL:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate presigned URL',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route DELETE /api/files/:key
 * @desc Delete a file from S3
 * @access Private (requires authentication)
 */
router.delete('/:key', authenticateToken, async (req, res) => {
  try {
    const { key } = req.params;

    if (!key) {
      return res.status(400).json({
        success: false,
        error: 'File key is required'
      });
    }

    // Decode the key (in case it's URL encoded)
    const decodedKey = decodeURIComponent(key);

    const deleteResult = await deleteFile(decodedKey);

    if (!deleteResult.success) {
      return res.status(500).json({
        success: false,
        error: deleteResult.error || 'Failed to delete file'
      });
    }

    console.log('✅ File deleted successfully:', {
      key: decodedKey,
      deletedBy: req.user?.username || req.user?.sub || 'unknown'
    });

    res.json({
      success: true,
      message: 'File deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting file:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete file',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;

