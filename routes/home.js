const express = require('express');
const { Op } = require('sequelize');
const router = express.Router();
const { sequelize, models } = require('../index');
const { User, Task, Tag } = models;

function isAuthenticated(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/login');
}

// Home
router.get('/', async (req, res) => {
  const statusFilter = req.query.status || '';
  const priorityFilter = req.query.priority || '';
  const tagFilter = req.query.tags ? (Array.isArray(req.query.tags) ? req.query.tags : [req.query.tags]) : [];

  let tasks = [];
  let tags = [];

  if (req.session.user) {
    const where = { user_id: req.session.user.id };
    if (statusFilter) where.status = statusFilter;
    if (priorityFilter) where.priority = priorityFilter;

    tasks = await Task.findAll({
      where,
      include: [{ model: Tag, through: { attributes: [] } }],
      order: [['created_at', 'DESC']]
    });

    // Фильтрация по тегам
    if (tagFilter.length) {
      tasks = tasks.filter(task => 
        task.Tags.some(tag => tagFilter.includes(tag.name))
      );
    }

    // Обновление overdue
    const today = new Date().toISOString().split('T')[0];
    for (const task of tasks) {
      if (task.due_date && task.due_date < today && task.status !== 'completed') {
        task.status = 'overdue';
        await task.save();
      }
    }

    tags = await Tag.findAll({ where: { user_id: req.session.user.id } });
  }

  res.render('home', {
    tasks,
    tags,
    statusFilter,
    priorityFilter,
    tagFilter
  });
});

// Создание задачи
router.post('/tasks', isAuthenticated, async (req, res) => {
  const { title, due_date, priority, status, tags, description } = req.body;
  if (!title) {
    req.session.flash = [{ type: 'danger', message: 'Название задачи обязательно' }];
    return res.redirect('/');
  }

  const task = await Task.create({
    user_id: req.session.user.id,
    title,
    description,
    status: status || 'in_progress',
    priority: priority || 'medium',
    due_date: due_date || null
  });

  if (tags) {
    const tagNames = tags.split(',').map(t => t.trim()).filter(t => t);
    for (const tagName of tagNames) {
      let tag = await Tag.findOne({ where: { name: tagName, user_id: req.session.user.id } });
      if (!tag) {
        tag = await Tag.create({ name: tagName, user_id: req.session.user.id });
      }
      await task.addTag(tag);
    }
  }

  req.session.flash = [{ type: 'success', message: 'Задача создана!' }];
  res.redirect('/');
});

// API для получения задачи (для модала)
router.get('/api/task/:id', isAuthenticated, async (req, res) => {
  const task = await Task.findOne({
    where: { id: req.params.id, user_id: req.session.user.id },
    include: [{ model: Tag, through: { attributes: [] } }]
  });
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json({
    id: task.id,
    title: task.title,
    due_date: task.due_date,
    priority: task.priority,
    status: task.status,
    tags: task.Tags.map(tag => tag.name).join(', '),
    description: task.description
  });
});

// Обновление задачи
router.post('/api/task/:id', isAuthenticated, async (req, res) => {
  const task = await Task.findOne({
    where: { id: req.params.id, user_id: req.session.user.id }
  });
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const { title, due_date, priority, status, tags, description } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  task.title = title;
  task.description = description;
  task.status = status || 'in_progress';
  task.priority = priority || 'medium';
  task.due_date = due_date || null;

  await task.save();
  await task.setTags([]); // Очистка старых тегов

  if (tags) {
    const tagNames = tags.split(',').map(t => t.trim()).filter(t => t);
    for (const tagName of tagNames) {
      let tag = await Tag.findOne({ where: { name: tagName, user_id: req.session.user.id } });
      if (!tag) {
        tag = await Tag.create({ name: tagName, user_id: req.session.user.id });
      }
      await task.addTag(tag);
    }
  }

  res.json({ message: 'Task updated' });
});

// Отметить как выполненную
router.post('/tasks/:id/complete', isAuthenticated, async (req, res) => {
  const task = await Task.findOne({
    where: { id: req.params.id, user_id: req.session.user.id }
  });
  if (!task) {
    req.session.flash = [{ type: 'danger', message: 'Задача не найдена' }];
    return res.redirect('/');
  }
  task.status = 'completed';
  await task.save();
  req.session.flash = [{ type: 'success', message: 'Задача отмечена как выполненная!' }];
  res.redirect('/');
});

// Удаление задачи
router.post('/tasks/:id/delete', isAuthenticated, async (req, res) => {
  const task = await Task.findOne({
    where: { id: req.params.id, user_id: req.session.user.id }
  });
  if (!task) {
    req.session.flash = [{ type: 'danger', message: 'Задача не найдена' }];
    return res.redirect('/');
  }
  await task.destroy();
  req.session.flash = [{ type: 'success', message: 'Задача удалена!' }];
  res.redirect('/');
});

module.exports = router;