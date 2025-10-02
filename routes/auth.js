const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcrypt');
const { sequelize, models } = require('../index');
const { User } = models;
const { Op } = require('sequelize');
const router = express.Router();

// Регистрация
router.get('/register', (req, res) => {
  res.render('register', { errors: [] });
});

router.post('/register', [
  body('username').notEmpty().withMessage('Имя пользователя обязательно'),
  body('email').isEmail().withMessage('Некорректный email'),
  body('password').isLength({ min: 6 }).withMessage('Пароль должен быть не менее 6 символов'),
  body('confirm_password').custom((value, { req }) => value === req.body.password).withMessage('Пароли не совпадают')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('register', { errors: errors.array() });
  }

  const { username, email, password, confirm_password } = req.body;

  try {
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.render('register', { errors: [{ msg: 'Email уже занят. <a href="/welcome">Войти?</a>' }] });
    }
    const existingUsername = await User.findOne({ where: { username } });
    if (existingUsername) {
      return res.render('register', { errors: [{ msg: 'Имя пользователя уже занято' }] });
    }

    const password_hash = await bcrypt.hash(password, 10);
    await User.create({ username, email, password_hash, avatar: '#528bff' });
    req.session.flash = [{ type: 'success', message: 'Регистрация успешна! Пожалуйста, войдите.' }];
    res.redirect('/welcome');
  } catch (err) {
    console.error('Registration error:', err);
    res.render('register', { errors: [{ msg: 'Ошибка при регистрации' }] });
  }
});

// Вход
router.get('/login', (req, res) => {
  console.log('Handling GET /login');
  res.render('welcome', { errors: [] });
});

router.post('/login', (req, res) => {
  console.log('Handling POST /login');
  res.redirect('/welcome');
});

router.get('/welcome', (req, res) => {
  console.log('Handling GET /welcome');
  res.render('welcome', { errors: [] });
});

router.post('/welcome', [
  body('login').notEmpty().withMessage('Логин (email или имя пользователя) обязателен'),
  body('password').notEmpty().withMessage('Пароль обязателен')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('welcome', { errors: errors.array() });
  }

  const { login, password } = req.body;

  try {
    const user = await User.findOne({ where: { [Op.or]: [{email: login}, {username: login}] } });
    if (!user) {
      return res.render('welcome', { errors: [{ msg: 'Логин не найден' }] });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.render('welcome', { errors: [{ msg: 'Неверный пароль' }] });
    }

    req.session.user = { id: user.id, username: user.username, email: user.email, avatar: user.avatar || '#528bff' };
    req.session.flash = [{ type: 'success', message: 'Добро пожаловать!' }];
    res.redirect('/');
  } catch (err) {
    console.error('Login error:', err);
    res.render('welcome', { errors: [{ msg: 'Ошибка при входе' }] });
  }
});

// Выход
router.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Logout error:', err);
      req.session.flash = [{ type: 'danger', message: 'Ошибка при выходе' }];
      return res.redirect('/');
    }
    // Clear cookie explicitly
    res.clearCookie('connect.sid', { path: '/' });
    // Добавлено: no-cache headers для предотвращения кэша
    res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.header('Pragma', 'no-cache');
    res.header('Expires', '0');
    res.redirect('/welcome?loggedout=true');
  });
});

module.exports = router;