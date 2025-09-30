module.exports = (sequelize, DataTypes) => {
  return sequelize.define('Tasktag', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    task_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    tag_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    tableName: 'task_tags',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['task_id', 'tag_id']
      }
    ]
  });
};