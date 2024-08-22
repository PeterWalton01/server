const app = require('./src/app');
const sequelize = require('./src/config/database');
const logger = require('./src/shared/logger');
// const User = require('./src/user/User');
// const bcrypt = require('bcrypt');
const TokenService = require('./src/auth/TokenService');

const port = process.env.PORT || 3000;

// const addUser = async (activeUserCount, inActiveUserCount = 0) => {
//   const total = activeUserCount + inActiveUserCount;
//   const hash = await bcrypt.hash('P4ssword', 10);
//   for (let i = 0; i < total; i++) {
//     await User.create({
//       username: `user${i + 1}`,
//       email: `user${i + 1}@mail.com`,
//       password: hash,
//       inactive: i >= activeUserCount,
//     });
//   }
// };

sequelize.sync();
// sequelize.sync({ force: true }).then(async () => {
//   await addUser(25);
// });

TokenService.scheduledCleanup();

app.listen(port, () => {
  logger.info(`app version ${process.env.npm_package_version} is running on http://localhost:${port}`);
});
