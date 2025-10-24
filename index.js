const express = require('express');
const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const bodyParser = require('body-parser');
const morgan = require('morgan');
const winston = require('winston');
const { Sequelize, Op } = require('sequelize');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcrypt');

// Настройка Sequelize: PostgreSQL на Render, SQLite локально
const sequelize = process.env.DATABASE_URL 
  ? new Sequelize(process.env.DATABASE_URL, { 
      dialect: 'postgres', 
      logging: (msg) => console.log('Sequelize:', msg),
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false // Для Render PostgreSQL
        }
      }
    })
  : new Sequelize({
      dialect: 'sqlite',
      storage: './db.sqlite',
      logging: (msg) => console.log('Sequelize:', msg)
    });

// Подключение моделей
const models = require('./models')(sequelize);
console.log('Models loaded:', Object.keys(models));

// Экспорт sequelize и моделей для маршрутов
module.exports = { sequelize, models, Op };

// Логирование с Winston
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

// Логирование запросов с morgan
const accessLogStream = fs.createWriteStream(path.join(__dirname, 'logs/access.log'), { flags: 'a' });
const app = express();
app.use(morgan('combined', { stream: accessLogStream }));

// Доверять прокси (Cloudflare/Render)
app.set('trust proxy', 1);

// Настройка сессий с connect-session-sequelize
const sessionStore = new SequelizeStore({
  db: sequelize,
  tableName: 'Sessions',
  checkExpirationInterval: 15 * 60 * 1000,
  expiration: 7 * 24 * 60 * 60 * 1000
});
sessionStore.sync({ force: false });

// Middleware для логирования заголовков и Set-Cookie
app.use((req, res, next) => {
  console.log('Raw headers:', req.headers);
  const originalSetHeader = res.setHeader;
  res.setHeader = function (name, value) {
    if (name.toLowerCase() === 'set-cookie') {
      console.log('Set-Cookie:', value);
    }
    originalSetHeader.call(this, name, value);
  };
  next();
});

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'your_secret_key',
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    secure: true, // HTTPS на Render
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: 'none', // Для кросс-доменных запросов
    httpOnly: true,
    path: '/'
  }
}));

// Добавляем Vary: Cookie
app.use((req, res, next) => {
  res.setHeader('Vary', 'Cookie');
  next();
});

// Anti-cache middleware
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Middleware для передачи user и flash в шаблоны
app.use((req, res, next) => {
  console.log('Session check:', {
    url: req.url,
    method: req.method,
    sessionID: req.sessionID,
    user: req.session.user || 'none',
    cookies: req.cookies || 'none',
    sessionStore: req.session ? 'exists' : 'missing',
    cookieHeader: req.headers.cookie || 'none'
  });
  if (req.method === 'POST' && req.url === '/logout') {
    console.log('Processing logout request, clearing user and preserving flash');
    res.locals.user = null;
    res.locals.flash = req.session.flash || [];
    next();
    return;
  }
  res.locals.user = req.session.user || null;
  res.locals.flash = req.session.flash || [];
  req.session.flash = [];
  logger.info(`Request: ${req.method} ${req.url} by user ${req.session.user ? req.session.user.username : 'anonymous'}`);
  if (!req.session.user && req.url === '/' && req.method === 'GET') {
    logger.info('Redirecting unauthenticated user to /welcome');
    return res.redirect('/welcome');
  }
  next();
});

// Маршруты
const authRoutes = require('./routes/auth');
const homeRoutes = require('./routes/home');
const weeklyRoutes = require('./routes/weekly');
app.use('/', authRoutes);
app.use('/', homeRoutes);
app.use('/', weeklyRoutes);
app.get('/api/check-username', async (req, res) => {
  const { username } = req.query;
  if (!username) return res.json({ available: true });
  try {
    const existing = await models.User.findOne({ 
      where: { username, id: { [Op.ne]: req.session.user?.id || 0 } } 
    });
    res.json({ available: !existing });
  } catch (err) {
    res.status(500).json({ available: false });
  }
});

// Профиль
app.get('/profile', async (req, res) => {
  if (!req.session.user) {
    logger.info('Profile access denied: No user in session');
    req.session.flash = [{ type: 'danger', message: 'Пожалуйста, войдите' }];
    return res.redirect('/welcome');
  }

  try {
    const { User } = models;
    const user = await User.findByPk(req.session.user.id);
    if (!user) {
      logger.error('Profile error: User not found', { userId: req.session.user.id });
      req.session.flash = [{ type: 'danger', message: 'Пользователь не найден' }];
      return res.redirect('/welcome');
    }
    res.render('profile', { user: { ...user.dataValues, avatar: user.avatar || '#528bff' }, errors: [] });
  } catch (err) {
    logger.error('Profile error', { error: err.message, stack: err.stack });
    res.render('error', { 
      error: process.env.NODE_ENV === 'production' ? 'Внутренняя ошибка сервера' : err.message,
      stack: process.env.NODE_ENV === 'production' ? null : err.stack 
    });
  }
});

app.post('/profile', [
  body('username').notEmpty().withMessage('Имя пользователя обязательно'),
  body('email').isEmail().withMessage('Некорректный email'),
  body('password').custom((value) => {
    if (value && value.trim().length < 6) {
      throw new Error('Пароль должен быть не менее 6 символов');
    }
    return true;
  }),
  body('confirm_password').custom((value, { req }) => {
    if (req.body.password && value !== req.body.password) {
      throw new Error('Пароли не совпадают');
    }
    return true;
  }).withMessage('Пароли не совпадают')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.info('Profile update validation failed', { errors: errors.array() });
    return res.render('profile', { user: req.session.user, errors: errors.array() });
  }

  try {
    const { username, email, password, avatar, confirm_password } = req.body;
    const { User } = models;
    const user = await User.findByPk(req.session.user.id);
    if (!user) {
      logger.error('Profile update error: User not found', { userId: req.session.user.id });
      req.session.flash = [{ type: 'danger', message: 'Пользователь не найден' }];
      return res.redirect('/welcome');
    }

    if (password && password.trim().length >= 6 && password === confirm_password) {
      user.password_hash = await bcrypt.hash(password, 10);
    }
    user.username = username;
    user.email = email;
    if (avatar) user.avatar = avatar;
    await user.save();

    req.session.user = { id: user.id, username: user.username, email: user.email, avatar: user.avatar || '#528bff' };
    req.session.flash = [{ type: 'success', message: 'Профиль обновлён!' }];
    res.redirect('/profile');
  } catch (err) {
    console.error('Profile update error:', {
      message: err.message,
      stack: err.stack,
      body: req.body
    });
    res.render('profile', { user: req.session.user, errors: [{ msg: 'Ошибка при обновлении профиля: ' + err.message }] });
  }
});

// Debug маршрут для проверки пользователей
app.get('/debug/users', async (req, res) => {
  try {
    const users = await models.User.findAll({ attributes: ['id', 'username', 'email'] });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Debug маршрут для проверки сессий
app.get('/debug/sessions', async (req, res) => {
  try {
    const sessions = await sequelize.query('SELECT * FROM Sessions');
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Debug маршрут для очистки 'Invalid date'
app.get('/debug/fix-dates', async (req, res) => {
  try {
    await models.Task.update({ due_date: null }, { where: Sequelize.literal('due_date = \'Invalid date\'') });
    res.json({ message: 'Fixed invalid due_date values' });
  } catch (err) {
    res.status(500).json({ error: 'Error fixing due_date: ' + err.message });
  }
});

// Обработка ошибок
app.use((err, req, res, next) => {
  logger.error(`Error: ${err.message}, Stack: ${err.stack}`);
  console.error('Error details:', { message: err.message, stack: err.stack });
  res.status(500).render('error', { 
    error: process.env.NODE_ENV === 'production' ? 'Внутренняя ошибка сервера' : err.message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack 
  });
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
sequelize.sync({ force: false }).then(() => {
  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    console.log(`Server running on port ${PORT}`);
  });
}).catch(err => {
  logger.error(`Sequelize sync error: ${err.message}, Stack: ${err.stack}`);
  console.error('Sequelize sync error:', err);
});

