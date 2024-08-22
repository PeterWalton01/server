const Sequelize = require('sequelize');
const sequelize = require('../config/database');

const Model = Sequelize.Model;

class Token extends Model {}

Token.init(
    {
      token: { type: Sequelize.STRING },
      // Not needed due to association with User - 
      // Injected by foreign key.
      // userid : { type: Sequelize.INTEGER },
      lastUsedAt: {
        type: Sequelize.DATE,
      }

    },
    {
      sequelize,
      modelName: 'token',
      timestamps: false,
    },
  );
  
  module.exports = Token;