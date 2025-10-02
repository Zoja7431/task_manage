const express = require('express');
const { Op } = require('sequelize');
const router = express.Router();
const { sequelize, models } = require('../index');
const { Task, Tag } = models;

// Middleware для проверки авторизации
function isAuthenticated(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/welcome'); // Редирект на /welcome для неавторизованных
}

// Маршрут для страницы "Неделя"
router.get('/weekly', isAuthenticated, async (req, res) => {
  const statusFilter = req.query.status || '';
  const today = new Date();
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 6);

  // Условия для фильтрации задач
  const where = {
    user_id: req.session.user.id,
    due_date: { [Op.between]: [today.toISOString().split('T')[0], weekEnd.toISOString().split('T')[0]] }
  };
  if (statusFilter) where.status = statusFilter;

  // Получение задач с тэгами
  const tasks = await Task.findAll({
    where,
    include: [{ model: Tag, through: { attributes: [] } }],
    order: [['due_date', 'ASC']]
  });

  // Нормализация due_date и обновление статуса просроченных задач
  today.setHours(0, 0, 0, 0);
  for (const task of tasks) {
    // Нормализация due_date
    if (task.due_date && (typeof task.due_date !== 'string' || task.due_date.trim() === '' || isNaN(new Date(task.due_date).getTime()))) {
      task.due_date = null;
      await task.save();
    }
    const dueDate = task.due_date ? new Date(task.due_date) : null;
    if (dueDate && dueDate < today.toISOString().split('T')[0] && task.status !== 'completed') {
      task.status = 'overdue';
      await task.save();
    }
  }

  // Группировка задач по дням
  const weekTasks = {};
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    weekTasks[date.toISOString().split('T')[0]] = [];
  }
  for (const task of tasks) {
    if (task.due_date) {
      weekTasks[task.due_date].push(task);
    }
  }

  // Рендеринг шаблона weekly.ejs
  res.render('weekly', { weekTasks, today, statusFilter });
});

module.exports = router;