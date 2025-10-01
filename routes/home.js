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
router.get('/', isAuthenticated, async (req, res) => {
  const statusFilter = req.query.status || '';
  const priorityFilter = req.query.priority || '';
  const tagFilter = req.query.tags ? (Array.isArray(req.query.tags) ? req.query.tags : [req.query.tags]) : [];

  const where = { user_id: req.session.user.id };
  if (statusFilter) where.status = statusFilter;
  if (priorityFilter) where.priority = priorityFilter;

  const tasks = await Task.findAll({
    where,
    include: [{ model: Tag, through: { attributes: [] } }],
    order: [['created_at', 'DESC']]
  });

  let filteredTasks = tasks;
  if (tagFilter.length) {
    filteredTasks = tasks.filter(task => 
      task.Tags.some(tag => tagFilter.includes(tag.name))
    );
  }

  const today = new Date().toISOString().split('T')[0];
  for (const task of tasks) {
    if (task.due_date && task.due_date < today && task.status !== 'completed') {
      task.status = 'overdue';
      await task.save();
    }
  }

  const tags = await Tag.findAll({ where: { user_id: req.session.user.id } });

  res.render('home', {
    tasks: filteredTasks,
    tags,
    statusFilter,
    priorityFilter,
    tagFilter,
    user: req.session.user
  });
});

// Создание задачи
router.post('/tasks', isAuthenticated, async (req, res) => {
  const { title, due_date, priority, tags, description } = req.body;
  if (!title) {
    req.session.flash = [{ type: 'danger', message: 'Название задачи обязательно' }];
    return res.redirect('/');
  }

  try {
    const task = await Task.create({
      user_id: req.session.user.id,
      title,
      description,
      status: 'in_progress',
      priority: priority || 'medium',
      due_date: due_date || null
    });

    if (tags) {
      const tagNames = tags.split(',').map(t => t.trim().toLowerCase()).filter(t => t);
      for (const tagName of tagNames) {
        let tag = await Tag.findOne({ where: { name: tagName, user_id: req.session.user.id } });
        if (!tag) {
          tag = await Tag.create({ name: tagName, user_id: req.session.user.id });
        }
        await task.addTag(tag);
      }
    }

    req.session.flash = [{ type: 'success', message: 'Задача создана' }];
    res.redirect('/');
  } catch (err) {
    console.error('Task creation error:', err);
    req.session.flash = [{ type: 'danger', message: 'Ошибка при создании задачи' }];
    res.redirect('/');
  }
});

// API для получения задачи
router.get('/api/task/:id', isAuthenticated, async (req, res) => {
  try {
    const task = await Task.findOne({
      where: { id: req.params.id, user_id: req.session.user.id },
      include: [{ model: Tag, through: { attributes: [] } }]
    });
    if (!task) return res.status(404).json({ error: 'Задача не найдена' });
    res.json({
      id: task.id,
      title: task.title,
      due_date: task.due_date,
      priority: task.priority,
      status: task.status,
      tags: task.Tags.map(tag => tag.name).join(','),
      description: task.description
    });
  } catch (err) {
    console.error('Task fetch error:', err);
    res.status(500).json({ error: 'Ошибка при получении задачи' });
  }
});

// Обновление задачи
router.post('/api/task/:id', isAuthenticated, async (req, res) => {
  try {
    const task = await Task.findOne({
      where: { id: req.params.id, user_id: req.session.user.id }
    });
    if (!task) {
      return res.status(404).json({ error: 'Задача не найдена' });
    }

    const { title, due_date, priority, tags, description } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Название обязательно' });
    }

    task.title = title;
    task.description = description;
    task.priority = priority || 'medium';
    task.due_date = due_date || null;

    await task.save();
    await task.setTags([]);

    if (tags) {
      const tagNames = tags.split(',').map(t => t.trim().toLowerCase()).filter(t => t);
      for (const tagName of tagNames) {
        let tag = await Tag.findOne({ where: { name: tagName, user_id: req.session.user.id } });
        if (!tag) {
          tag = await Tag.create({ name: tagName, user_id: req.session.user.id });
        }
        await task.addTag(tag);
      }
    }

    res.json({ message: 'Задача обновлена' });
  } catch (err) {
    console.error('Task update error:', err);
    res.status(500).json({ error: 'Ошибка при обновлении задачи' });
  }
});

// Отметить задачу
router.post('/tasks/:id/complete', isAuthenticated, async (req, res) => {
  try {
    const task = await Task.findOne({
      where: { id: req.params.id, user_id: req.session.user.id }
    });
    if (!task) {
      return res.status(404).json({ error: 'Задача не найдена' });
    }
    task.status = task.status === 'completed' ? 'in_progress' : 'completed';
    await task.save();
    res.json({ message: task.status === 'completed' ? 'Задача завершена' : 'Задача возвращена в активные' });
  } catch (err) {
    console.error('Task completion error:', err);
    res.status(500).json({ error: 'Ошибка при отметке задачи' });
  }
});

// Удаление задачи
router.post('/tasks/:id/delete', isAuthenticated, async (req, res) => {
  try {
    const task = await Task.findOne({
      where: { id: req.params.id, user_id: req.session.user.id }
    });
    if (!task) {
      return res.status(404).json({ error: 'Задача не найдена' });
    }
    await task.destroy();
    res.json({ message: 'Задача удалена' });
  } catch (err) {
    console.error('Task deletion error:', err);
    res.status(500).json({ error: 'Ошибка при удалении задачи' });
  }
});

// Очистка завершённых задач
router.post('/tasks/clear-completed', isAuthenticated, async (req, res) => {
  try {
    await Task.destroy({
      where: { user_id: req.session.user.id, status: 'completed' }
    });
    res.json({ message: 'Завершённые задачи очищены' });
  } catch (err) {
    console.error('Clear completed tasks error:', err);
    res.status(500).json({ error: 'Ошибка при очистке завершённых задач' });
  }
});

// Создание тэга
router.post('/tags', isAuthenticated, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Название тэга обязательно' });
  }
  const normalizedName = name.trim().toLowerCase();
  try {
    const existingTag = await Tag.findOne({ 
      where: { 
        name: normalizedName, 
        user_id: req.session.user.id 
      } 
    });
    if (existingTag) {
      return res.status(400).json({ error: 'Тэг с таким именем уже существует' });
    }
    const tag = await Tag.create({ name: normalizedName, user_id: req.session.user.id });
    res.json({ message: 'Тэг создан', name: tag.name });
  } catch (err) {
    console.error('Tag creation error:', err);
    res.status(500).json({ error: 'Ошибка при создании тэга' });
  }
});

// Обновление тэга
router.put('/tags/:oldName', isAuthenticated, async (req, res) => {
  const { oldName } = req.params;
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Название тэга обязательно' });
  }
  const normalizedName = name.trim().toLowerCase();
  try {
    const existingTag = await Tag.findOne({ 
      where: { 
        name: normalizedName, 
        user_id: req.session.user.id 
      } 
    });
    if (existingTag) {
      return res.status(400).json({ error: 'Тэг с таким именем уже существует' });
    }
    const tag = await Tag.findOne({ where: { name: oldName, user_id: req.session.user.id } });
    if (!tag) {
      return res.status(404).json({ error: 'Тэг не найден' });
    }
    tag.name = normalizedName;
    await tag.save();
    res.json({ message: 'Тэг обновлён', name: tag.name });
  } catch (err) {
    console.error('Tag update error:', err);
    res.status(500).json({ error: 'Ошибка при обновлении тэга' });
  }
});

// Проверка задач для тэга
router.get('/api/tags/:name/tasks', isAuthenticated, async (req, res) => {
  const { name } = req.params;
  try {
    const tag = await Tag.findOne({ where: { name, user_id: req.session.user.id } });
    if (!tag) {
      return res.status(404).json({ error: 'Тэг не найден' });
    }
    const tasks = await Task.findAll({
      include: [{
        model: Tag,
        where: { id: tag.id },
        through: { attributes: [] }
      }],
      where: { user_id: req.session.user.id }
    });
    res.json({ taskCount: tasks.length });
  } catch (err) {
    console.error('Tag tasks check error:', err);
    res.status(500).json({ error: 'Ошибка при проверке тэга' });
  }
});

// Удаление тэга
router.delete('/tags/:name', isAuthenticated, async (req, res) => {
  const { name } = req.params;
  try {
    const tag = await Tag.findOne({ where: { name, user_id: req.session.user.id } });
    if (!tag) {
      return res.status(404).json({ error: 'Тэг не найден' });
    }
    await tag.destroy();
    res.json({ message: 'Тэг удалён' });
  } catch (err) {
    console.error('Tag deletion error:', err);
    res.status(500).json({ error: 'Ошибка при удалении тэга' });
  }
});

module.exports = router;