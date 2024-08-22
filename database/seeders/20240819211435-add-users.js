'use strict';

/** @type {import('sequelize-cli').Migration} */

const bcrypt = require('bcrypt');

module.exports = {
  // eslint-disable-next-line no-unused-vars
  async up (queryInterface, Sequelize) {
    const hash = await bcrypt.hash('P4ssword', 10);
    const users = [];
    for (let i = 0; i < 25; i++) {
      await users.push({
        username: `user${i + 1}`,
        email: `user${i + 1}@mail.com`,
        password: hash,
        inactive: false,
        createdAt: new Date(),
        updatedAt: new Date() 
      });
    }
    await queryInterface.bulkInsert('users', users, {});

  },

  // eslint-disable-next-line no-unused-vars
  async down (queryInterface, Sequelize) {
     await queryInterface.bulkDelete('users', null, {});

  }
};
