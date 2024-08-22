/* eslint-disable no-unused-vars */
'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('tokens',{ 
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      token: { 
        type: Sequelize.STRING 
      },
      lastUsedAt: 
      {
        type: Sequelize.DATE,
      },
      userid: {
        type: Sequelize.INTEGER,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'cascade'
      },

    }
    );
     
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('tokens');
  }
};
