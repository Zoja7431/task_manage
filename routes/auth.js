const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcrypt');
const dns = require('dns').promises;
const { User } = require('../models')(require('../index').sequelize);
const router = express.Router();

function isAuthenticated(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/login');
}

// Register
router.get('/register', (req, res) => {
  res.render('register', { errors: [] });
});

router.post('/register', [
  body('username').isLength({ min: 4, max: 20 }).withMessage('Имя пользователя должно быть от 4 до 20 символов'),
  body('email').isEmail().withMessage('Введите корректный email'),
  body('password').isLength({ min: 6 }).withMessage('Пароль должен быть не менее 6 символов')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('register', { errors: errors.array() });
  }

  const { username, email, password } = req.body;

  // Проверка домена email
  try {
    const domain = email.split('@')[1];
    await dns.resolve(domain);
  } catch (err) {
    return res.render('register', { errors: [{ msg: 'Недействительный домен email' }] });
  }

  // Проверка уникальности
  const existingUser = await User.findOne({ where: { [Op.or]: [{ username }, { email }] } });
  if (existingUser) {
    return res.render('register', { errors: [{ msg: 'Имя пользователя или email уже заняты' }] });
  }

  const password_hash = await bcrypt.hash(password, 10);
  await User.create({ username, email, password_hash });
  req.session.flash = [{ type: 'success', message: 'Регистрация успешна! Пожалуйста, войдите' }];
  res.redirect('/login');
});

// Login
router.get('/login', (req, res) => {
  res.render('login', { errors: [] });
});

router.post('/login', [
  body('username').notEmpty().withMessage('Введите имя пользователя или email'),
  body('password').notEmpty().withMessage('Введите пароль')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('login', { errors: errors.array() });
  }

  const { username, password } = req.body;
  const user = await User.findOne({ where: { [Op.or]: [{ username }, { email: username }] } });
  if (!user) {
    return res.render('login', { errors: [{ msg: 'Аккаунт не найден. <a href="/register">Зарегистрироваться?</a>' }] });
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    return res.render('login', { errors: [{ msg: 'Неверный пароль' }] });
  }

  req.session.user = { id: user.id, username: user.username, email: user.email };
  res.redirect('/');
});

// Profile
router.get('/profile', isAuthenticated, (req, res) => {
  res.render('profile', { user: req.session.user, errors: [] });
});

router.post('/profile', isAuthenticated, [
  body('username').isLength({ min: 4, max: 20 }).withMessage('Имя пользователя должно быть от 4 до 20 символов'),
  body('email').isEmail().withMessage('Введите корректный email'),
  body('password').optional().isLength({ min: 6 }).withMessage('Пароль должен быть не менее 6 символов')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('profile', { user: req.session.user, errors: errors.array() });
  }

  const { username, email, password } = req.body;
  try {
    const domain = email.split('@')[1];
    await dns.resolve(domain);
  } catch (err) {
    return res.render('profile', { user: req.session.user, errors: [{ msg: 'Недействительный домен email' }] });
  }

  const existingUser = await User.findOne({
    where: { [Op.or]: [{ username }, { email }], id: { [Op.ne]: req.session.user.id } }
  });
  if (existingUser) {
    return res.render('profile', { user: req.session.user, errors: [{ msg: 'Имя пользователя или email уже заняты' }] });
  }

  const user = await User.findByPk(req.session.user.id);
  user.username = username;
  user.email = email;
  if (password) {
    user.password_hash = await bcrypt.hash(password, 10);
  }
  await user.save();

  req.session.user = { id: user.id, username: user.username, email: user.email };
  req.session.flash = [{ type: 'success', message: 'Профиль обновлен!' }];
  res.redirect('/profile');
});

// Logout
router.post('/logout', isAuthenticated, (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

module.exports = router;