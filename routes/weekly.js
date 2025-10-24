const express = require('express');
const router = express.Router();
const { models } = require('../index'); // Из вашего index.js

router.get('/weekly', async (req, res) => {
  if (!req.session.user) return res.redirect('/welcome');

  try {
    const { Task, Tag } = models;
    const userId = req.session.user.id;

    // Вычисление недели (понедельник - воскресенье)
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(monday.getDate() - monday.getDay() + (monday.getDay() === 0 ? -6 : 1)); // Понедельник
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);

    // Невыполненные задачи на неделю
    const tasks = await Task.findAll({
      where: {
        user_id: userId,
        status: { [models.Sequelize.Op.ne]: 'completed' },
        due_date: { [models.Sequelize.Op.between]: [monday, sunday] }
      },
      include: [{ model: Tag, through: { attributes: [] } }]
    });

    // Группировка по датам
    const weekTasks = {};
    const timelineData = [];
    let currentDay = new Date(monday);
    for (let i = 0; i < 7; i++) {
      const dateStr = currentDay.toISOString().split('T')[0];
      weekTasks[dateStr] = tasks.filter(t => t.due_date && new Date(t.due_date).toISOString().split('T')[0] === dateStr);
      const taskCount = weekTasks[dateStr].length;
      const intensity = taskCount === 0 ? 'empty' : taskCount <= 2 ? 'low' : taskCount <= 4 ? 'medium' : 'high';
      timelineData.push({
        date: dateStr,
        dayName: currentDay.toLocaleDateString('ru-RU', { weekday: 'short' }),
        dayNumber: currentDay.getDate(),
        taskCount,
        intensity,
        isToday: dateStr === today.toISOString().split('T')[0],
        isPast: currentDay < today
      });
      currentDay.setDate(currentDay.getDate() + 1);
    }

    res.render('weekly', { timelineData, weekTasks });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

module.exports = router;