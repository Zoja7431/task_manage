const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { Sequelize } = require('sequelize');
const path = require('path');
const homeRoutes = require('./routes/home');
const authRoutes = require('./routes/auth');
const weeklyRoutes = require('./routes/weekly');

const app = express();

// Настройка Sequelize
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './db.sqlite',
  logging: false
});

// Подключение моделей
require('./models')(sequelize);

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
  next();
});

// Маршруты
app.use('/', homeRoutes);
app.use('/', authRoutes);
app.use('/', weeklyRoutes);

// Запуск сервера
const PORT = process.env.PORT || 3000;
sequelize.sync({ force: true }).then(() => { // Убери force: true после первого запуска
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});