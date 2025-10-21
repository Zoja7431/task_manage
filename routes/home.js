const express = require('express');
const { Sequelize, Op } = require('sequelize');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const { sequelize, models } = require('../index');
const { User, Task, Tag } = models;

function isAuthenticated(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/welcome');
}

// Валидация для создания/обновления задачи
const taskValidation = [
  body('title').trim().notEmpty().withMessage('Название задачи обязательно').isLength({ max: 100 }).withMessage('Название не должно превышать 100 символов').escape(),
  body('description').optional().trim().isLength({ max: 1000 }).withMessage('Описание не должно превышать 1000 символов').escape(),
  body('priority').optional().isIn(['low', 'medium', 'high']).withMessage('Недопустимое значение приоритета').escape(),
  body('tags').optional().trim().isLength({ max: 200 }).withMessage('Теги не должны превышать 200 символов').escape(),
  body('due_date').optional().trim().custom((value) => {
    if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new Error('Некорректный формат даты (YYYY-MM-DD)');
    }
    return true;
  }).escape(),
  body('due_time').optional().trim().custom((value, { req }) => {
    if (value && !/^\d{2}:\d{2}$/.test(value)) {
      throw new Error('Некорректный формат времени (hh:mm)');
    }
    if (value && !req.body.due_date) {
      throw new Error('Сначала укажите дату');
    }
    return true;
  }).escape()
];

// Home
router.get('/', isAuthenticated, async (req, res) => {
  const statusFilter = req.query.status || '';
  const priorityFilter = req.query.priority || '';
  const tagFilter = req.query.tags ? (typeof req.query.tags === 'string' ? req.query.tags.split(',').map(t => t.trim()).filter(t => t) : Array.isArray(req.query.tags) ? req.query.tags : []) : [];

  const where = { user_id: req.session.user.id };
  if (statusFilter) where.status = statusFilter;
  if (priorityFilter) where.priority = priorityFilter;

  try {
    // Server-side tag filtering
    const include = [{ model: Tag, through: { attributes: [] } }];
    if (tagFilter.length) {
      include[0].where = { name: { [Op.in]: tagFilter.map(t => t.toLowerCase()) } };
      include[0].required = true;
    }
    const tasks = await Task.findAll({
      where,
      include,
      order: [['id', 'DESC']],
      distinct: true
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const task of tasks) {
      if (task.due_date && isNaN(new Date(task.due_date).getTime())) {
        task.due_date = null;
        await task.save();
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

    const filteredTasks = tasks; // already filtered by include when tagFilter provided

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
router.post('/tasks', isAuthenticated, taskValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    req.session.flash = errors.array().map(err => ({ type: 'danger', message: err.msg }));
    return res.redirect('/');
  }

  const { title, due_date: bodyDueDate, due_time, priority, tags, description } = req.body;
  let due_date = null;
  if (bodyDueDate && bodyDueDate.trim() !== '') {
    const time = due_time && due_time.trim() !== '' ? due_time : '00:00';
    // use local time instead of forcing Z (UTC)
    due_date = new Date(`${bodyDueDate}T${time}:00`);
    if (isNaN(due_date.getTime())) {
      req.session.flash = [{ type: 'danger', message: 'Некорректная дата или время' }];
      return res.redirect('/');
    }
  }

  try {
    const task = await Task.create({
      user_id: req.session.user.id,
      title,
      description,
      status: 'in_progress',
      priority: priority || 'medium',
      due_date
    });
    let due_time_response = null;
    if (due_date && due_time && due_time.trim() !== '') {
      const hours = due_date.getHours();
      const minutes = due_date.getMinutes();
      due_time_response = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
    req.session.flash = [{ type: 'success', message: 'Задача успешно создана' }];
    res.json({
      id: task.id,
      title,
      due_date: bodyDueDate,
      due_time: due_time_response,
      priority: priority || 'medium',
      description: description || '',
      tags: tags || ''
    });
  } catch (err) {
    console.error('Task creation error:', err);
    req.session.flash = [{ type: 'danger', message: 'Ошибка при создании задачи: ' + err.message }];
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
    let due_date = task.due_date;
    let due_time = null;
    if (due_date) {
      const dateObj = new Date(due_date);
      if (isNaN(dateObj.getTime())) {
        due_date = null;
        task.due_date = null;
        await task.save();
      } else {
        due_date = dateObj.toISOString().split('T')[0];
        const hours = dateObj.getHours();
        const minutes = dateObj.getMinutes();
        const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        due_time = timeStr !== '00:00' ? timeStr : null;
      }
    }
    res.json({
      id: task.id,
      title: task.title,
      due_date,
      due_time,
      priority: task.priority,
      description: task.description || '',
      tags: task.Tags.map(t => t.name).join(', ')
    });
  } catch (err) {
    console.error('Task fetch error:', err);
    res.status(500).json({ error: 'Ошибка при получении задачи' });
  }
});

// Обновление задачи
router.post('/api/task/:id', isAuthenticated, taskValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array().map(err => err.msg).join('; ') });
  }

  const { title, due_date: bodyDueDate, due_time, priority, tags, description } = req.body;
  // Preserve existing time if date provided but time not changed
  let due_date = null;
  if (bodyDueDate && bodyDueDate.trim() !== '') {
    // Fetch existing task first to preserve time component when due_time is not provided
    const existingTask = await Task.findOne({ where: { id: req.params.id, user_id: req.session.user.id } });
    if (!existingTask) {
      return res.status(404).json({ error: 'Задача не найдена' });
    }
    let hours = 0, minutes = 0;
    if (due_time && due_time.trim() !== '') {
      const [h, m] = due_time.split(':').map(Number);
      hours = Number.isFinite(h) ? h : 0;
      minutes = Number.isFinite(m) ? m : 0;
    } else if (existingTask.due_date) {
      const prev = new Date(existingTask.due_date);
      if (!isNaN(prev.getTime())) {
        hours = prev.getHours();
        minutes = prev.getMinutes();
      }
    }
    const hoursStr = String(hours).padStart(2, '0');
    const minutesStr = String(minutes).padStart(2, '0');
    due_date = new Date(`${bodyDueDate}T${hoursStr}:${minutesStr}:00`);
    if (isNaN(due_date.getTime())) {
      return res.status(400).json({ error: 'Некорректная дата или время' });
    }
  }

  try {
    const task = await Task.findOne({ 
      where: { id: req.params.id, user_id: req.session.user.id },
      include: [{ model: Tag, through: { attributes: [] } }]
    });
    if (!task) {
      return res.status(404).json({ error: 'Задача не найдена' });
    }
    
    // Обновляем основные поля задачи
    await task.update({
      title,
      description,
      priority: priority || 'medium',
      due_date
    });
    
    // Обновляем теги если они переданы
    if (tags !== undefined) {
      const tagNames = tags ? tags.split(',').map(t => t.trim()).filter(t => t) : [];
      const existingTags = await Tag.findAll({ 
        where: { name: { [Op.in]: tagNames }, user_id: req.session.user.id } 
      });
      
      // Удаляем все существующие связи с тегами
      await task.setTags([]);
      
      // Добавляем новые теги
      if (existingTags.length > 0) {
        await task.setTags(existingTags);
      }
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('Task update error:', err);
    res.status(500).json({ error: 'Ошибка при обновлении задачи' });
  }
});

// Простое обновление даты задачи (для drag and drop)
router.post('/api/task/:id/date', isAuthenticated, async (req, res) => {
  try {
    const { due_date, due_time } = req.body;
    const task = await Task.findOne({ where: { id: req.params.id, user_id: req.session.user.id } });
    if (!task) {
      return res.status(404).json({ error: 'Задача не найдена' });
    }
    
    let newDueDate = null;
    if (due_date && due_date.trim() !== '') {
      const time = due_time && due_time.trim() !== '' ? due_time : '00:00';
      newDueDate = new Date(`${due_date}T${time}:00`);
      if (isNaN(newDueDate.getTime())) {
        return res.status(400).json({ error: 'Некорректная дата или время' });
      }
    }
    
    await task.update({ due_date: newDueDate });
    res.json({ success: true });
  } catch (err) {
    console.error('Task date update error:', err);
    res.status(500).json({ error: 'Ошибка при обновлении даты задачи' });
  }
});

// Создание тэга
router.post('/tags', isAuthenticated, [
  body('name').trim().notEmpty().withMessage('Название тэга обязательно').isLength({ max: 50 }).withMessage('Название тэга не должно превышать 50 символов').escape()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array().map(err => err.msg).join('; ') });
  }

  const { name } = req.body;
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
router.put('/tags/:name', isAuthenticated, [
  body('name').trim().notEmpty().withMessage('Новое название обязательно').isLength({ max: 50 }).withMessage('Название тэга не должно превышать 50 символов').escape()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array().map(err => err.msg).join('; ') });
  }

  const { name: newName } = req.body;
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
