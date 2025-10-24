const express = require('express');
const router = express.Router();
const { models, Op } = require('../index');
const ejs = require('ejs');  // Добавьте это
const path = require('path');  // Добавьте это

router.get('/weekly', async (req, res) => {
  if (!req.session.user) {
    console.log('No user in session, redirecting to /welcome');
    return res.redirect('/welcome');
  }

  try {
    const { Task, Tag } = models;
    const userId = req.session.user.id;
    const weekOffset = parseInt(req.query.weekOffset || '0', 10);
    const today = new Date();

    // Вычисление текущей недели с учетом смещения
    const monday = new Date(today);
    monday.setDate(monday.getDate() - monday.getDay() + (monday.getDay() === 0 ? -6 : 1) + weekOffset * 7);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);

    // Получаем все задачи
    const tasks = await Task.findAll({
      where: {
        user_id: userId,
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
      weekTasks[dateStr] = tasks
        .filter(t => t.due_date && new Date(t.due_date).toISOString().split('T')[0] === dateStr)
        .map(t => ({
          ...t.toJSON(),
          isOverdue: t.due_date && new Date(t.due_date) < today && t.status !== 'completed'
        }));
      const taskCount = weekTasks[dateStr].length;
      const intensity = taskCount === 0 ? 'empty' : taskCount <= 2 ? 'low' : taskCount <= 4 ? 'medium' : 'high';
      timelineData.push({
        date: dateStr,
        dayName: currentDay.toLocaleDateString('ru-RU', { weekday: 'short' }),
        dayNumber: currentDay.getDate(),
        taskCount,
        intensity,
        isToday: dateStr === today.toISOString().split('T')[0] && weekOffset === 0,
        isPast: weekOffset < 0 || (weekOffset === 0 && currentDay < today)
      });
      currentDay.setDate(currentDay.getDate() + 1);
    }

    console.log('Rendering weekly with tasks:', Object.keys(weekTasks).length, 'days');
    console.log('User data:', req.session.user);
    console.log('Flash messages:', req.session.flash || []);

    // Данные для рендеринга (без body: 'weekly')
    const data = {
      timelineData,
      weekTasks,
      user: req.session.user,
      flash: req.session.flash || [],
      weekOffset,
      monday: monday.toLocaleDateString('ru-RU', { month: 'short', day: 'numeric' }),
      sunday: sunday.toLocaleDateString('ru-RU', { month: 'short', day: 'numeric' })
    };

try {
  const weeklyContent = await ejs.renderFile(path.join(__dirname, '../views/weekly.ejs'), data);
  const fullPage = await ejs.renderFile(path.join(__dirname, '../views/base.ejs'), { ...data, body: weeklyContent });
  res.send(fullPage);
} catch (renderErr) {
  console.error('Render error:', renderErr);
  res.status(500).send('Ошибка рендеринга шаблона');
}

  } catch (err) {
    console.error('Weekly route error:', err.message, err.stack);
    // Аналогично рендерим error через base, но для простоты оставим как есть
    res.status(500).render('error', {
      error: 'Внутренняя ошибка сервера',
      stack: process.env.NODE_ENV === 'production' ? null : err.stack,
      user: req.session.user || null,
      flash: req.session.flash || []
    });
  }
});

module.exports = router;