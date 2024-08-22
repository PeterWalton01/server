const { randomString } = require('../shared/genertator');
const Token = require('../auth/Token');
const Sequelize = require('sequelize');
const ONE_WEEK_IN_MILLIS = 7 * 24 * 60 * 60 * 1000;

const createToken = async (user) => {
  const token = randomString(32);
  const userid = Number.parseInt(user.id);
  try {
    await Token.create({
      token: token,
      userid: userid,
      lastUsedAt: new Date(),
    });
    // eslint-disable-next-line no-unused-vars
  } catch (err) {
    console.log('failed', user);
  }

  return token;
};

const verify = async (token) => {
  const oneWeekAgo = new Date(Date.now() - ONE_WEEK_IN_MILLIS);
  const tokenInDB = await Token.findOne({
    where: {
      token: token,
      lastUsedAt: {
        [Sequelize.Op.gt]: oneWeekAgo,
      },
    },
  });
  tokenInDB.lastUsedAt = new Date();
  await tokenInDB.save();
  const userid = tokenInDB.userid;
  return { id: userid };
};

const deleteToken = async (token) => {
  await Token.destroy({ where: { token: token } });
};

// eslint-disable-next-line no-unused-vars
const deleteTokensForUser = async (id) => {
  // Replaced by cascading delete
  // await Token.destroy({where: { userid: id}});
};

const clearTokens = async (userid) => {
   await Token.destroy({where: { userid: userid}});
};

const scheduledCleanup = () => {
  setInterval( async () => {
    const oneWeekAgo = new Date(Date.now() - ONE_WEEK_IN_MILLIS);
    await Token.destroy({
      where: {
        lastUsedAt: {
          [Sequelize.Op.lt]: oneWeekAgo,
        },
      },
    });
  }, 60*60*1000);
};

module.exports = {
  createToken,
  verify,
  deleteToken,
  deleteTokensForUser,
  scheduledCleanup,
  clearTokens,
};
