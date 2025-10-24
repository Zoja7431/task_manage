const express = require('express');
const router = express.Router();
const { models, Op } = require('../index');

router.get('/weekly', async (req, res) => {
  if (!req.session.user) {
    console.log('No user in session, redirecting to /welcome');
    return res.redirect('/welcome');
  }

  try {
    const { Task, Tag } = models;
    const userId = req.session.user.id;

    // Вычисление недели (понедельник - воскресенье)
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(monday.getDate() - monday.getDay() + (monday.getDay() === 0 ? -6 : 1));
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);

    // Невыполненные задачи на неделю
    const tasks = await Task.findAll({
      where: {
        user_id: userId,
        status: { [Op.ne]: 'completed' },
        due_date: { [Op.between]: [monday, sunday] }
      },
      include: [{ model: Tag, through: { attributes: [] } }]
    });

    console.log('Tasks fetched:', tasks ? tasks.length : 0);

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

    console.log('Rendering weekly with tasks:', Object.keys(weekTasks).length, 'days');
    console.log('User data:', req.session.user);
    console.log('Flash messages:', req.session.flash || []);

    // Передаем все необходимые данные
    res.render('weekly', {
      body: 'weekly', // Явно указываем body для base.ejs
      timelineData,
      weekTasks,
      user: req.session.user,
      flash: req.session.flash || []
    });
  } catch (err) {
    console.error('Weekly route error:', err.message, err.stack);
    res.status(500).render('error', {
      body: 'error',
      error: 'Внутренняя ошибка сервера',
      stack: process.env.NODE_ENV === 'production' ? null : err.stack,
      user: req.session.user || null,
      flash: req.session.flash || []
    });
  }
});

module.exports = router;