const express = require('express');
const { Pool } = require('pg');
const { authenticateToken } = require('../middleware/auth');
const { sendMessage } = require('../utils/sqs-service');
const router = express.Router();

// Configure PostgreSQL pool using DATABASE_URL or individual PG_* env vars
const poolConfig = {};
if (process.env.DATABASE_URL) {
  poolConfig.connectionString = process.env.DATABASE_URL;
} else {
  poolConfig.host = process.env.PGHOST || process.env.DB_HOST || undefined;
  poolConfig.user = process.env.PGUSER || process.env.DB_USER || undefined;
  poolConfig.password = process.env.PGPASSWORD || process.env.DB_PASS || undefined;
  poolConfig.database = process.env.PGDATABASE || process.env.DB_NAME || undefined;
  poolConfig.port = process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : undefined;
}

// Enable simple SSL if requested (common on some hosted Postgres / RDS setups)
if (process.env.PGSSLMODE === 'require' || process.env.NODE_ENV === 'production') {
  poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);

/**
 * @route POST /api/courses
 * @desc Create a new course and push to SQS
 * @access Private (requires authentication)
 */
router.post('/', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { name, code, department, image } = req.body;

    // Validate required fields
    if (!name || !code || !department) {
      return res.status(400).json({
        success: false,
        error: 'Course name, code, and department are required'
      });
    }

    // Validate course name
    if (name.length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Course name must be at least 3 characters long'
      });
    }

    // Validate course code format
    if (code.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Course code must be at least 2 characters long'
      });
    }

    // Validate department
    if (department.length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Department name must be at least 3 characters long'
      });
    }

    // Start transaction
    await client.query('BEGIN');

    // Check if course code already exists
    const checkQuery = 'SELECT id FROM courses WHERE code = $1';
    const checkResult = await client.query(checkQuery, [code]);

    if (checkResult.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: 'A course with this code already exists'
      });
    }

    const imageUrl = image || '/images/course-placeholder.png';

    // Get the next ID value
    const maxIdQuery = 'SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM courses';
    const maxIdResult = await client.query(maxIdQuery);
    const nextId = maxIdResult.rows[0].next_id;

    // Insert the new course into the database
    const insertQuery = `
      INSERT INTO courses (id, name, code, department, image)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, name, code, department, image
    `;
    
    const insertResult = await client.query(insertQuery, [nextId, name, code, department, imageUrl]);
    
    const newCourse = insertResult.rows[0];

    // Commit the transaction
    await client.query('COMMIT');

    console.log('✅ Course created in database:', {
      id: newCourse.id,
      code: newCourse.code,
      name: newCourse.name
    });

    // Prepare message for SQS
    const sqsMessage = {
      eventType: 'COURSE_CREATED',
      timestamp: new Date().toISOString(),
      course: {
        id: newCourse.id,
        name: newCourse.name,
        code: newCourse.code,
        department: newCourse.department,
        image: newCourse.image,
      },
      metadata: {
        createdBy: req.user?.username || req.user?.sub || 'unknown',
        requestId: req.headers['x-request-id'] || null
      }
    };

    // Send message to SQS (non-blocking)
    const sqsResult = await sendMessage(sqsMessage, {
      messageType: 'CourseCreation',
    });

    if (!sqsResult.success) {
      console.warn('⚠️ Course created but failed to send SQS message:', sqsResult.error);
      // Don't fail the request if SQS fails - the course was created successfully
    }

    // Return success response
    res.status(201).json({
      success: true,
      message: 'Course created successfully',
      course: newCourse,
      sqs: {
        sent: sqsResult.success,
        messageId: sqsResult.messageId || null
      }
    });

  } catch (error) {
    // Rollback transaction on error
    await client.query('ROLLBACK');
    
    console.error('❌ Error creating course:', error);
    
    // Handle specific database errors
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({
        success: false,
        error: 'A course with this code already exists'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create course',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    client.release();
  }
});

/**
 * @route GET /api/courses
 * @desc Get all courses
 * @access Public
 */
router.get('/', async (req, res) => {
  try {
    const query = 'SELECT id, name, code, department, image FROM courses ORDER BY name';
    const { rows } = await pool.query(query);

    res.json({
      success: true,
      count: rows.length,
      courses: rows
    });
  } catch (error) {
    console.error('❌ Error fetching courses:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch courses'
    });
  }
});

/**
 * @route GET /api/courses/:id
 * @desc Get a single course by ID
 * @access Public
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = 'SELECT id, name, code, department, image FROM courses WHERE id = $1';
    const { rows } = await pool.query(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Course not found'
      });
    }

    res.json({
      success: true,
      course: rows[0]
    });
  } catch (error) {
    console.error('❌ Error fetching course:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch course'
    });
  }
});

/**
 * @route DELETE /api/courses/:id
 * @desc Delete a course
 * @access Private (requires authentication)
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    // Check if course exists
    const checkQuery = 'SELECT id, name, code FROM courses WHERE id = $1';
    const checkResult = await client.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: 'Course not found'
      });
    }

    const course = checkResult.rows[0];

    // Delete the course
    const deleteQuery = 'DELETE FROM courses WHERE id = $1';
    await client.query(deleteQuery, [id]);

    await client.query('COMMIT');

    console.log('✅ Course deleted:', { id, code: course.code });

    // Send deletion event to SQS
    const sqsMessage = {
      eventType: 'COURSE_DELETED',
      timestamp: new Date().toISOString(),
      course: {
        id: course.id,
        name: course.name,
        code: course.code
      },
      metadata: {
        deletedBy: req.user?.username || req.user?.sub || 'unknown'
      }
    };

    await sendMessage(sqsMessage, { messageType: 'CourseDeletion' });

    res.json({
      success: true,
      message: 'Course deleted successfully'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error deleting course:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to delete course'
    });
  } finally {
    client.release();
  }
});

module.exports = router;

