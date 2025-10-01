const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const User = require('./user')(sequelize, DataTypes);
  const Task = require('./task')(sequelize, DataTypes);
  const Tag = sequelize.define('Tag', {
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
}, {
  timestamps: false // Отключаем createdAt и updatedAt
});
  const TaskTag = require('./tasktag')(sequelize, DataTypes);

  // Связи
  User.hasMany(Task, { foreignKey: 'user_id', onDelete: 'CASCADE' });
  Task.belongsTo(User, { foreignKey: 'user_id' });
  User.hasMany(Tag, { foreignKey: 'user_id', onDelete: 'CASCADE' });
  Tag.belongsTo(User, { foreignKey: 'user_id' });
  Task.belongsToMany(Tag, { through: TaskTag, foreignKey: 'task_id' });
  Tag.belongsToMany(Task, { through: TaskTag, foreignKey: 'tag_id' });

  return { User, Task, Tag, TaskTag };
};