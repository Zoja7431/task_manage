const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcrypt');
const { sequelize, models } = require('../index');
const { User } = models;
const router = express.Router();

// Регистрация
router.get('/register', (req, res) => {
  res.render('register', { errors: [] });
});

router.post('/register', [
  body('username').notEmpty().withMessage('Имя пользователя обязательно'),
  body('email').isEmail().withMessage('Некорректный email'),
  body('password').isLength({ min: 6 }).withMessage('Пароль должен быть не менее 6 символов')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('register', { errors: errors.array() });
  }

  const { username, email, password } = req.body;

  try {
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      req.session.flash = [{ type: 'danger', message: 'Email уже занят' }];
      return res.redirect('/register');
    }

    const password_hash = await bcrypt.hash(password, 10);
    await User.create({ username, email, password_hash, avatar: '#528bff' });
    req.session.flash = [{ type: 'success', message: 'Регистрация успешна! Пожалуйста, войдите.' }];
    res.redirect('/login');
  } catch (err) {
    console.error('Registration error:', err);
    req.session.flash = [{ type: 'danger', message: 'Ошибка при регистрации' }];
    res.redirect('/register');
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
  body('email').isEmail().withMessage('Некорректный email'),
  body('password').notEmpty().withMessage('Пароль обязателен')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('welcome', { errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    const user = await User.findOne({ where: { email } });
    if (!user) {
      req.session.flash = [{ type: 'danger', message: 'Email не найден' }];
      return res.redirect('/welcome');
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      req.session.flash = [{ type: 'danger', message: 'Неверный пароль' }];
      return res.redirect('/welcome');
    }

    req.session.user = { id: user.id, username: user.username, email: user.email, avatar: user.avatar || '#528bff' };
    req.session.flash = [{ type: 'success', message: 'Добро пожаловать!' }];
    res.redirect('/');
  } catch (err) {
    console.error('Login error:', err);
    req.session.flash = [{ type: 'danger', message: 'Ошибка при входе' }];
    res.redirect('/welcome');
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
    res.redirect('/login');
  });
});

module.exports = router;