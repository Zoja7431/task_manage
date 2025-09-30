const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const winston = require('winston');
const { Sequelize, Op } = require('sequelize');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');

// Настройка Sequelize
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './db.sqlite',
  logging: false
});

// Подключение моделей
const models = require('./models')(sequelize);
console.log('Models loaded:', Object.keys(models));

// Экспорт sequelize и моделей для маршрутов
module.exports = { sequelize, models };

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

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'your_secret_key',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 дней
  }
}));

// Middleware для передачи user и flash в шаблоны
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.flash = req.session.flash || [];
  req.session.flash = [];
  logger.info(`Request: ${req.method} ${req.url} by user ${req.session.user ? req.session.user.username : 'anonymous'}`);
  next();
});

// Маршруты
const homeRoutes = require('./routes/home');
const authRoutes = require('./routes/auth');
const weeklyRoutes = require('./routes/weekly');
app.use('/', homeRoutes);
app.use('/', authRoutes);
app.use('/', weeklyRoutes);

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
  body('password').optional().isLength({ min: 6 }).withMessage('Пароль должен быть не менее 6 символов')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.info('Profile update validation failed', { errors: errors.array() });
    return res.render('profile', { user: req.session.user, errors: errors.array() });
  }

  try {
    const { User } = models;
    const user = await User.findByPk(req.session.user.id);
    if (!user) {
      logger.error('Profile update error: User not found', { userId: req.session.user.id });
      req.session.flash = [{ type: 'danger', message: 'Пользователь не найден' }];
      return res.redirect('/welcome');
    }

    const { username, email, password, avatar } = req.body;
    user.username = username;
    user.email = email;
    if (password) user.password = password;
    if (avatar) user.avatar = avatar;
    await user.save();

    req.session.user = { id: user.id, username: user.username, email: user.email, avatar: user.avatar || '#528bff' };
    req.session.flash = [{ type: 'success', message: 'Профиль обновлён!' }];
    res.redirect('/profile');
  } catch (err) {
    logger.error('Profile update error', { error: err.message, stack: err.stack });
    res.render('profile', { user: req.session.user, errors: [{ msg: 'Ошибка при обновлении профиля' }] });
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