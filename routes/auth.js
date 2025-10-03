const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcrypt');
const { sequelize, models } = require('../index');
const { User } = models;
const { Op } = require('sequelize');
const router = express.Router();

// Главная страница (Welcome)
router.get('/welcome', (req, res) => {
  console.log('Handling GET /welcome');
  res.render('welcome', { errors: [] });
});

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
  console.log('Register attempt:', { username, email, password: '[hidden]' });

  try {
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.render('register', { errors: [{ msg: 'Email уже занят. <a href="/login">Войти?</a>' }] });
    }
    const existingUsername = await User.findOne({ where: { username } });
    if (existingUsername) {
      return res.render('register', { errors: [{ msg: 'Имя пользователя уже занято' }] });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, email, password_hash, avatar: '#528bff' });
    console.log('User created:', { id: user.id, username, email });
    req.session.flash = [{ type: 'success', message: 'Регистрация успешна! Пожалуйста, войдите.' }];
    res.redirect('/login');
  } catch (err) {
    console.error('Registration error:', err);
    res.render('register', { errors: [{ msg: 'Ошибка при регистрации' }] });
  }
});

// Вход
router.get('/login', (req, res) => {
  console.log('Handling GET /login');
  res.render('login', { errors: [] });
});

router.post('/login', [
  body('login').notEmpty().withMessage('Логин (email или имя пользователя) обязателен'),
  body('password').notEmpty().withMessage('Пароль обязателен')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('Login validation errors:', errors.array());
    return res.render('login', { errors: errors.array() });
  }

  const { login, password } = req.body;
  console.log('Login attempt:', { login, password: '[hidden]' });

  try {
    const user = await User.findOne({ where: { [Op.or]: [{email: login}, {username: login}] } });
    if (!user) {
      console.log('Login failed: User not found');
      return res.render('login', { errors: [{ msg: 'Логин не найден' }] });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      console.log('Login failed: Incorrect password');
      return res.render('login', { errors: [{ msg: 'Неверный пароль' }] });
    }

    req.session.user = { id: user.id, username: user.username, email: user.email, avatar: user.avatar || '#528bff' };
    console.log('Login successful, user:', { id: user.id, username: user.username });
    console.log('Session before redirect:', req.session);
    res.redirect('/');
  } catch (err) {
    console.error('Login error:', err);
    res.render('login', { errors: [{ msg: 'Ошибка при входе' }] });
  }
});

// Выход
router.post('/logout', async (req, res) => {
  console.log('Handling POST /logout, session:', req.session?.user ? `user=${req.session.user.username}` : 'no session');
  
  if (!req.session) {
    console.log('No session found, redirecting to /welcome');
    res.clearCookie('connect.sid', {
      path: '/',
      secure: false,
      sameSite: 'none',
      domain: 'taskflow-wmgd.onrender.com'
    });
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    req.session.flash = [{ type: 'success', message: 'Вы успешно вышли' }];
    return res.redirect('/welcome?loggedout=true');
  }

  try {
    req.session.user = null;
    req.session.flash = null;

    await new Promise((resolve, reject) => {
      req.session.destroy(err => {
        if (err) {
          console.error('Logout error during session destroy:', { error: err.message, stack: err.stack });
          reject(err);
        } else {
          console.log('Session destroyed successfully');
          resolve();
        }
      });
    });

    res.clearCookie('connect.sid', {
      path: '/',
      secure: false,
      sameSite: 'none',
      domain: 'taskflow-wmgd.onrender.com'
    });

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    req.session.flash = [{ type: 'success', message: 'Вы успешно вышли' }];
    console.log('Redirecting to /welcome?loggedout=true');
    res.redirect('/welcome?loggedout=true');
  } catch (err) {
    console.error('Logout error:', { error: err.message, stack: err.stack });
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.redirect('/welcome?loggedout=true');
  }
});

module.exports = router;