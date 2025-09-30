const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const winston = require('winston');
const { Sequelize } = require('sequelize');
const path = require('path');
const fs = require('fs');

// Настройка Sequelize
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './db.sqlite',
  logging: false
});

// Подключение моделей
const models = require('./models')(sequelize);
console.log('Models loaded:', Object.keys(models)); // Отладочный вывод

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
  secret: 'your_secret_key', // Замени на случайный
  resave: false,
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Middleware для передачи user в шаблоны
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

// Обработка ошибок
app.use((err, req, res, next) => {
  logger.error(`Error: ${err.message}, Stack: ${err.stack}`);
  console.error('Error details:', { message: err.message, stack: err.stack }); // Отладочный вывод
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