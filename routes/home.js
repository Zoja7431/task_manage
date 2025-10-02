const express = require('express');
const { Sequelize, Op } = require('sequelize');
const router = express.Router();
const { sequelize, models } = require('../index');
const { User, Task, Tag } = models;

function isAuthenticated(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/welcome');
}

// Home
router.get('/', isAuthenticated, async (req, res) => {
  const statusFilter = req.query.status || '';
  const priorityFilter = req.query.priority || '';
  const tagFilter = req.query.tags ? (typeof req.query.tags === 'string' ? req.query.tags.split(',').map(t => t.trim()).filter(t => t) : Array.isArray(req.query.tags) ? req.query.tags : []) : [];

  const where = { user_id: req.session.user.id };
  if (statusFilter) where.status = statusFilter;
  if (priorityFilter) where.priority = priorityFilter;

  try {
    const tasks = await Task.findAll({
      where,
      include: [{ model: Tag, through: { attributes: [] } }],
      order: [['id', 'DESC']]
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const task of tasks) {
      // Нормализация due_date: если invalid или '', set null
      if (task.due_date && (typeof task.due_date !== 'string' || task.due_date.trim() === '' || isNaN(new Date(task.due_date).getTime()))) {
        task.due_date = null;
        await task.save(); // Сохраняем фикс в БД
      }
      const dueDate = task.due_date ? new Date(task.due_date) : null;
      let changed = false;
      if (dueDate && dueDate < today && task.status !== 'completed') {
        task.status = 'overdue';
        changed = true;
      } else if (task.status === 'overdue' && (!dueDate || dueDate >= today)) {
        task.status = 'in_progress';
        changed = true;
      }
      if (changed) {
        await task.save();
      }
    }

    let filteredTasks = tasks;
    if (tagFilter.length) {
      filteredTasks = tasks.filter(task => 
        task.Tags.some(tag => tagFilter.includes(tag.name))
      );
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
  } catch (err) {
    console.error('Home route error:', {
      message: err.message,
      stack: err.stack
    });
    res.status(500).render('error', { 
      error: process.env.NODE_ENV === 'production' ? 'Внутренняя ошибка сервера' : err.message,
      stack: process.env.NODE_ENV === 'production' ? null : err.stack 
    });
  }
});

// Создание задачи
router.post('/tasks', isAuthenticated, async (req, res) => {
  const { title, due_date: bodyDueDate, priority, tags, description } = req.body;
  if (!title) {
    req.session.flash = [{ type: 'danger', message: 'Название задачи обязательно' }];
    return res.redirect('/');
  }
  const due_date = bodyDueDate && bodyDueDate.trim() !== '' ? bodyDueDate : null;

  try {
    const task = await Task.create({
      user_id: req.session.user.id,
      title,
      description,
      status: 'in_progress',
      priority: priority || 'medium',
      due_date
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
  } catch (err) {
    console.error('Task creation error:', err);
    req.session.flash = [{ type: 'danger', message: 'Ошибка при создании задачи' }];
    res.redirect('/');
  }
});

// Отметка как завершённая
router.post('/tasks/:id/complete', isAuthenticated, async (req, res) => {
  try {
    const task = await Task.findOne({ where: { id: req.params.id, user_id: req.session.user.id } });
    if (!task) {
      return res.status(404).json({ error: 'Задача не найдена' });
    }
    task.status = task.status === 'completed' ? 'in_progress' : 'completed';
    await task.save();
    res.json({ status: task.status });
  } catch (err) {
    console.error('Task complete error:', err);
    res.status(500).json({ error: 'Ошибка при отметке задачи' });
  }
});

// Удаление задачи
router.post('/tasks/:id/delete', isAuthenticated, async (req, res) => {
  try {
    const task = await Task.findOne({ where: { id: req.params.id, user_id: req.session.user.id } });
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

// Очистка завершенных задач
router.post('/tasks/clear-completed', isAuthenticated, async (req, res) => {
  try {
    await Task.destroy({
      where: {
        user_id: req.session.user.id,
        status: 'completed'
      }
    });
    res.json({ message: 'Завершенные задачи очищены' });
  } catch (err) {
    console.error('Clear completed tasks error:', err);
    res.status(500).json({ error: 'Ошибка при очистке завершенных задач' });
  }
});

// Получение задачи для редактирования
router.get('/api/task/:id', isAuthenticated, async (req, res) => {
  try {
    const task = await Task.findOne({
      where: { id: req.params.id, user_id: req.session.user.id },
      include: [{ model: Tag, through: { attributes: [] } }]
    });
    if (!task) {
      return res.status(404).json({ error: 'Задача не найдена' });
    }
    // Нормализация due_date: если invalid или '', set null и save
    let due_date = task.due_date;
    if (due_date && (typeof due_date !== 'string' || due_date.trim() === '' || isNaN(new Date(due_date).getTime()))) {
      due_date = null;
      task.due_date = null;
      await task.save();
    }
    res.json({
      id: task.id,
      title: task.title,
      due_date,
      priority: task.priority,
      description: task.description,
      tags: task.Tags.map(t => t.name).join(', ')
    });
  } catch (err) {
    console.error('Task fetch error:', err);
    res.status(500).json({ error: 'Ошибка при получении задачи' });
  }
});

// Обновление задачи
router.post('/api/task/:id', isAuthenticated, async (req, res) => {
  const { title, due_date: bodyDueDate, priority, tags, description } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Название обязательно' });
  }
  const due_date = bodyDueDate && bodyDueDate.trim() !== '' ? bodyDueDate : null;

  try {
    const task = await Task.findOne({ where: { id: req.params.id, user_id: req.session.user.id } });
    if (!task) {
      return res.status(404).json({ error: 'Задача не найдена' });
    }
    await task.update({
      title,
      description,
      priority,
      due_date
    });

    await task.setTags([]);
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

    res.json({ message: 'Задача обновлена' });
  } catch (err) {
    console.error('Task update error:', err);
    res.status(500).json({ error: 'Ошибка при обновлении задачи' });
  }
});

// Создание тэга
router.post('/tags', isAuthenticated, async (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Название тэга обязательно' });
  }
  try {
    const [tag, created] = await Tag.findOrCreate({
      where: { name: name.toLowerCase(), user_id: req.session.user.id },
      defaults: { name: name.toLowerCase(), user_id: req.session.user.id }
    });
    if (!created) {
      return res.status(409).json({ error: 'Тэг уже существует' });
    }
    res.json({ name: tag.name });
  } catch (err) {
    console.error('Tag creation error:', err);
    res.status(500).json({ error: 'Ошибка при создании тэга' });
  }
});

// Обновление тэга
router.put('/tags/:name', isAuthenticated, async (req, res) => {
  const { name: newName } = req.body;
  if (!newName) {
    return res.status(400).json({ error: 'Новое название обязательно' });
  }
  try {
    const tag = await Tag.findOne({ where: { name: req.params.name, user_id: req.session.user.id } });
    if (!tag) {
      return res.status(404).json({ error: 'Тэг не найден' });
    }
    tag.name = newName.toLowerCase();
    await tag.save();
    res.json({ name: tag.name });
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