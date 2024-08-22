const bcrypt = require('bcrypt');
const User = require('./User');
const TokenService = require('../auth/TokenService'); 
const EmailService = require('../email/EmailService');
const Sequelize = require('sequelize');
const sequalize = require('../config/database');
const EmailException = require('../email/EmailExceptiion');
const InvalidTokenException = require('./InvalidTokenException');
const NotFoundException = require('../error/NotFoundException');
const { randomString } = require('../shared/genertator');
const FileService = require('../file/FileService');
// Replaced by cascading delete
// const TokenService = require('../auth/TokenService');

// const generateToken = (length) => {
//   // hex doubles the length hence the use of substring
//   return crypto.randomBytes(length).toString('hex').substring(length);
// };

const save = async (body) => {
  // use 10 salt rounds
  // do not allow inactive to be set false
  const { username, email, password } = body;
  const activationToken = randomString(16);
  const hash = await bcrypt.hash(password, 10);
  const user = { username, email, password: hash, activationToken };
  // const user = Object.assign({}, req.body, {password: hash});
  const transaction = await sequalize.transaction();
  await User.create(user, { transaction });
  try {
    await EmailService.sendAccountActivation(email, user.activationToken);
    await transaction.commit();
    // eslint-disable-next-line no-unused-vars
  } catch (err) {
    await transaction.rollback();
    throw new EmailException();
  }
  // await EmailService.sendAccountActivation(email, user.activationToken);
};

const findByEmail = async (email) => {
  return await User.findOne({ where: { email: email } });
};

const activate = async (token) => {
  const user = await User.findOne({ where: { activationToken: token } });
  if (!user) {
    throw new InvalidTokenException();
  }
  user.inactive = false;
  user.activationToken = null;
  await user.save();
};

const getUsers = async (page, size = 10, authenticatedUser) => {
  const pageSize = size;
  const id = authenticatedUser ? authenticatedUser.id : 0;
  const usersWithCount = await User.findAndCountAll({
    where: {
      id: {
        [Sequelize.Op.not]: id,
      },
      inactive: false,
    },
    attributes: ['id', 'username', 'email', 'image'],
    limit: size,
    offset: page * pageSize,
  });
  return {
    content: usersWithCount.rows,
    page,
    size,
    totalPages: Math.ceil(usersWithCount.count / pageSize),
  };
};

const getUser = async (id) => {
  const user = await User.findOne({
    where: { id, inactive: false },
    attributes: ['id', 'username', 'email', 'image'],
  });
  if (!user) {
    throw new NotFoundException('user_not_found');
  }
  return user;
};

const updateUser = async (id, updateBody) => {
  const user = await User.findOne({ where: { id: id } });
  user.username = updateBody.username;
  if(updateBody.image) {
    if(user.image) {
      await FileService.deleteProfileImage(user.image);
    }
    user.image = await FileService.saveProfileImage(updateBody.image);
  }
  await user.save();
  return {
    id: id,
    username: user.username,
    email: user.email,
    image: user.image
  };
};

const deleteUser = async (id) => {
  await User.destroy({ where: { id: id } });
  // Replace by cascading delete
  // await TokenService.deleteTokensForUser(id);
};

const passwordResetRequest = async (email) => {
  const user = await findByEmail(email);
  if(!user) {
    throw new NotFoundException('email_not_in_use');
  }
  user.passwordResetToken = randomString(16);
  await user.save();
  try {
    await EmailService.sendPasswordReset(email, user.passwordResetToken); 
  // eslint-disable-next-line no-unused-vars
  } catch(err) {
    throw new EmailException();
  }


  
};

const updatePassword = async (updateRequest) => {
  const user = await findByPasswordResetToken(updateRequest.passwordResetToken); 
  user.password = await bcrypt.hash(updateRequest.password,  10);
  user.passwordResetToken = null;
  user.inactive = false;
  user.activationToken = null;
  await user.save();
  await TokenService.clearTokens(user.id);
};  

const findByPasswordResetToken = async (token) => {
  const user = await User.findOne({ where: {
    passwordResetToken: token 
   }}); 
   return user;
};

module.exports = {
  save,
  findByEmail,
  activate,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  passwordResetRequest,
  updatePassword,
  findByPasswordResetToken,
};
