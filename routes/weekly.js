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
  console.log('Handling GET /weekly for user:', req.session.user.username);
  const statusFilter = req.query.status || '';
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Нормализация текущей даты
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 6);
  
  // Дата для статистики (3 дня назад)
  const statsStart = new Date(today);
  statsStart.setDate(today.getDate() - 3);

  // Условия для фильтрации задач недели
  const where = {
    user_id: req.session.user.id,
    due_date: { [Op.between]: [today.toISOString().split('T')[0], weekEnd.toISOString().split('T')[0]] }
  };
  if (statusFilter) where.status = statusFilter;

  try {
    // Получение задач недели с тэгами
    const tasks = await Task.findAll({
      where,
      include: [{ model: Tag, through: { attributes: [] } }],
      order: [['due_date', 'ASC']]
    });

    // Получение предстоящих задач (после недели)
    const upcomingTasks = await Task.findAll({
      where: {
        user_id: req.session.user.id,
        due_date: { [Op.gt]: weekEnd.toISOString().split('T')[0] }
      },
      include: [{ model: Tag, through: { attributes: [] } }],
      order: [['due_date', 'ASC']],
      limit: 10
    });

    // Получение задач без даты
    const unsortedTasks = await Task.findAll({
      where: {
        user_id: req.session.user.id,
        due_date: null
      },
      include: [{ model: Tag, through: { attributes: [] } }],
      order: [['created_at', 'DESC']]
    });

    // Статистика за период (3 дня назад + неделя)
    const statsWhere = {
      user_id: req.session.user.id,
      due_date: { [Op.between]: [statsStart.toISOString().split('T')[0], weekEnd.toISOString().split('T')[0]] }
    };
    
    const [totalTasks, completedTasks, plannedTasks] = await Promise.all([
      Task.count({ where: statsWhere }),
      Task.count({ where: { ...statsWhere, status: 'completed' } }),
      Task.count({ where: { ...statsWhere, status: 'in_progress' } })
    ]);

    // Нормализация due_date и обновление статуса просроченных задач
    for (const task of tasks) {
      if (task.due_date && (typeof task.due_date !== 'string' || task.due_date.trim() === '' || isNaN(new Date(task.due_date).getTime()))) {
        console.log(`Invalid due_date for task ${task.id}: ${task.due_date}, setting to null`);
        task.due_date = null;
        await task.save();
      }
      const dueDate = task.due_date ? new Date(task.due_date) : null;
      if (dueDate && dueDate < today && task.status !== 'completed') {
        console.log(`Task ${task.id} is overdue, updating status`);
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
        const dueDate = new Date(task.due_date);
        if (!isNaN(dueDate.getTime())) {
          const dateKey = dueDate.toISOString().split('T')[0];
          if (weekTasks[dateKey]) {
            console.log(`Adding task ${task.id} to date ${dateKey}`);
            weekTasks[dateKey].push(task);
          }
        }
      }
    }

    // Рендеринг шаблона weekly.ejs
    res.render('weekly', { 
      weekTasks, 
      today, 
      statusFilter, 
      upcomingTasks, 
      unsortedTasks,
      stats: {
        total: totalTasks,
        completed: completedTasks,
        planned: plannedTasks
      }
    });
  } catch (err) {
    console.error('Weekly route error:', { error: err.message, stack: err.stack });
    res.render('error', {
      error: process.env.NODE_ENV === 'production' ? 'Внутренняя ошибка сервера' : err.message,
      stack: process.env.NODE_ENV === 'production' ? null : err.stack
    });
  }
});

module.exports = router;
