const express = require('express');
const { Op } = require('sequelize');
const router = express.Router();
const { sequelize, models } = require('../index');
const { Task, Tag } = models;

function isAuthenticated(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/login');
}

router.get('/weekly', isAuthenticated, async (req, res) => {
  const today = new Date();
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 6);

  const tasks = await Task.findAll({
    where: {
      user_id: req.session.user.id,
      due_date: { [Op.between]: [today.toISOString().split('T')[0], weekEnd.toISOString().split('T')[0]] }
    },
    include: [{ model: Tag, through: { attributes: [] } }],
    order: [['due_date', 'ASC']]
  });

  // Обновление overdue
  for (const task of tasks) {
    if (task.due_date && task.due_date < today.toISOString().split('T')[0] && task.status !== 'completed') {
      task.status = 'overdue';
      await task.save();
    }
  }

  // Группировка по дням
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

  res.render('weekly', { weekTasks, today });
});

module.exports = router;