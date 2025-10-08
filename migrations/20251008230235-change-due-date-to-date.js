'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('tasks', 'due_date', {
      type: Sequelize.DATE,
      allowNull: true
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('tasks', 'due_date', {
      type: Sequelize.DATEONLY,
      allowNull: true
    });
  }
};