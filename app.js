require('dotenv').config(); // Load .env early so routes can access process.env

var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var session = require('express-session');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var authRouter = require('./routes/auth');
var coursesRouter = require('./routes/courses');
const { initializeOIDCClient, getOIDCClient } = require('./utils/cognito-config');

var app = express();

// Initialize OIDC Client
let oidcClientReady = false;
initializeOIDCClient()
  .then(() => {
    oidcClientReady = true;
    console.log('OIDC Client initialized');
  })
  .catch(error => {
    console.error('Failed to initialize OIDC client:', error);
  });

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/auth', authRouter);
app.use('/api/courses', coursesRouter);

// OIDC Callback Route
app.get('/callback', async (req, res) => {
  try {
    if (!oidcClientReady) {
      console.log('OIDC client not ready, redirecting to login');
      return res.redirect('/login');
    }

    const client = await getOIDCClient();
    const params = client.callbackParams(req);
    
    // Get the redirect URI from config
    const { cognitoConfig } = require('./utils/cognito-config');
    
    const tokenSet = await client.callback(
      cognitoConfig.RedirectUri,
      params,
      {
        nonce: req.session.nonce,
        state: req.session.state
      }
    );

    // Get user info from token
    const userInfo = await client.userinfo(tokenSet.access_token);
    req.session.userInfo = userInfo;
    req.session.tokens = {
      accessToken: tokenSet.access_token,
      idToken: tokenSet.id_token,
      refreshToken: tokenSet.refresh_token
    };

    console.log('User authenticated via OIDC:', userInfo);
    
    res.redirect('/');
  } catch (err) {
    console.error('Callback error:', err);
    res.redirect('/login?error=authentication_failed');
  }
});

// Helper function to get path from URL
function getPathFromURL(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname || '/';
  } catch (e) {
    return '/';
  }
}

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render custom 404 page if not found
  if (err.status === 404) {
    return res.status(404).render('404');
  }

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
