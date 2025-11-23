var express = require('express');
const {fetchInstanceIdentity} = require("../utils/instance-metadata-service");
const { Pool } = require('pg');
var router = express.Router();

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

router.get('/', async function(req, res, next) {
  try {
    const query = 'SELECT id, name, code, department, image FROM courses ORDER BY name';
    const { rows } = await pool.query(query);

    res.render('index', { title: 'School Courses', courses: rows });
  } catch (err) {
    console.error('Error querying courses:', err.message || err);
    res.render('index', { title: 'School Courses', courses: [], dbError: String(err) });
  }
});

router.get('/health', function(req, res, next) {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Authentication pages
router.get('/login', function(req, res, next) {
    res.render('login', { title: 'Login - Course Feedback Portal' });
});

router.get('/signup', function(req, res, next) {
    res.render('signup', { title: 'Sign Up - Course Feedback Portal' });
});

router.get('/verify', function(req, res, next) {
    res.render('verify', { title: 'Verify Email - Course Feedback Portal' });
});

router.get('/health', (req, res) => {
  res.status(200).json({ ok: true });
});


router.get('/whoami', async (req, res) => {
  try {
    const data = await fetchInstanceIdentity();
    res.json({
      ok: true,
      ...data,
      requestId: req.headers['x-amzn-trace-id'] || req.headers['x-request-id'] || null,
      via: req.headers['via'] || null
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

module.exports = router;
