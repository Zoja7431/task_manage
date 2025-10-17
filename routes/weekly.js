const express = require('express');
const { Op } = require('sequelize');
const router = express.Router();
const { sequelize, models } = require('../index');
const { User, Task, Tag, TaskTag } = models;

function isAuthenticated(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/welcome');
}

// Week
router.get('/weekly', isAuthenticated, async (req, res) => {
  const currentDate = new Date();
  const startOfWeek = new Date(currentDate);
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1); // Понедельник

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6); // Воскресенье

  const startOfLast3Days = new Date(currentDate);
  startOfLast3Days.setHours(0, 0, 0, 0);
  startOfLast3Days.setDate(startOfLast3Days.getDate() - 3); // Три дня до текущей недели

  try {
    // Задачи за текущую неделю
    const weekTasks = await Task.findAll({
      where: {
        user_id: req.session.user.id,
        due_date: {
          [Op.between]: [startOfWeek, endOfWeek],
        },
      },
      include: [{ model: Tag, through: TaskTag }],
      order: [['due_date', 'ASC']],
    });

    // Задачи за последние 3 дня (для статистики)
    const last3DaysTasks = await Task.findAll({
      where: {
        user_id: req.session.user.id,
        due_date: {
          [Op.between]: [startOfLast3Days, currentDate],
        },
      },
      include: [{ model: Tag, through: TaskTag }],
      order: [['due_date', 'ASC']],
    });

    // Предстоящие задачи (за пределами недели)
    const upcomingTasks = await Task.findAll({
      where: {
        user_id: req.session.user.id,
        due_date: {
          [Op.gt]: endOfWeek,
        },
        status: {
          [Op.ne]: 'completed',
        },
      },
      include: [{ model: Tag, through: TaskTag }],
      order: [['due_date', 'ASC']],
    });

    // Статистика за текущую неделю
    const pendingTasksWeek = weekTasks.filter(task => task.status !== 'completed' && task.status !== 'overdue').length;
    const completedTasksWeek = weekTasks.filter(task => task.status === 'completed').length;
    const overdueTasksWeek = weekTasks.filter(task => task.status === 'overdue').length;

    // Статистика за последние 3 дня
    const pendingTasksLast3 = last3DaysTasks.filter(task => task.status !== 'completed' && task.status !== 'overdue').length;
    const completedTasksLast3 = last3DaysTasks.filter(task => task.status === 'completed').length;
    const overdueTasksLast3 = last3DaysTasks.filter(task => task.status === 'overdue').length;

    // Задачи без даты
    const tasksWithoutDate = await Task.findAll({
      where: {
        user_id: req.session.user.id,
        due_date: null,
      },
      include: [{ model: Tag, through: TaskTag }],
      order: [['created_at', 'DESC']],
    });

    res.render('week', {
      user: req.session.user,
      weekTasks,
      upcomingTasks,
      tasksWithoutDate,
      pendingTasksWeek,
      completedTasksWeek,
      overdueTasksWeek,
      pendingTasksLast3,
      completedTasksLast3,
      overdueTasksLast3,
    });
  } catch (err) {
    console.error('Week route error:', err);
    res.status(500).render('error', { error: 'Внутренняя ошибка сервера' });
  }
});

// Перетаскивание задач для изменения даты
app.post('/tasks/:id/update-date', isAuthenticated, async (req, res) => {
  const { newDate } = req.body;
  try {
    const task = await Task.findOne({ where: { id: req.params.id, user_id: req.session.user.id } });
    if (!task) {
      return res.status(404).json({ error: 'Задача не найдена' });
    }
    task.due_date = new Date(newDate);
    await task.save();
    res.json({ success: true });
  } catch (err) {
    console.error('Task update date error:', err);
    res.status(500).json({ error: 'Ошибка при обновлении даты' });
  }
});

module.exports = router;