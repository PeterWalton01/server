/* eslint-disable no-undef */
const request = require('supertest');
const app = require('../src/app');
const User = require('../src/user/User');
const Token = require('../src/auth/Token');
const sequelize = require('../src/config/database');
const SMTPServer = require('smtp-server').SMTPServer;
const en = require('../locales/en/translation.json');
const is = require('../locales/is/translation.json');
const bcrypt = require('bcrypt');
const config = require('config');

let lastMail, server;
let simulateSmtpFailure;

beforeAll(async () => {
  try {
    server = new SMTPServer({
      authOptional: true,
      onData(stream, session, callback) {
        let mailBody;
        stream.on('data', (data) => {
          mailBody += data.toString();
        });
        stream.on('end', () => {
          if (simulateSmtpFailure) {
            const err = new Error('Invalid mailbox');
            err.responseCode = 553;
            callback(err);
          }
          lastMail = mailBody;
          callback();
        });
      },
    });
    await server.listen(config.mail.port, 'localhost');
  } catch (err) {
    throw new Error(err);
  }
  if(process.env.NODE_ENV === 'test') {
    await sequelize.sync();
  }
});

beforeEach(async () => {
  simulateSmtpFailure = false;
  // true is changed to {cascade: true} for
  // compatibility with databases other than sqlite
  await User.destroy({ truncate: { cascade: true } });
});

afterAll(async () => {
  await server.close();
  jest.setTimeout(5000);
});

const activeUser = {
  username: 'user1',
  email: 'user1@mail.com',
  password: 'P4ssword',
  inactive: false,
};

const addUser = async (user = { ...activeUser }) => {
  const hash = await bcrypt.hash(user.password, 10);
  user.password = hash;
  return await User.create(user);
};

const postPasswordReset = (email = 'user1@mail.com', options = {}) => {
  const agent = request(app).post('/api/1.0/user/password');
  if (options.language) {
    agent.set('Accept-Language', options.language);
  }
  return agent.send({ email: email });
};

const putPasswordReset = (body = {}, options = {}) => {
  const agent = request(app).put('/api/1.0/user/password');
  if (options.language) {
    agent.set('Accept-Language', options.language);
  }
  return agent.send(body);
};

describe('Password Reset Request', () => {
  it('returns 404 for a password reset request from an unknown email', async () => {
    const response = await postPasswordReset();
    expect(response.status).toBe(404);
  });

  it.each`
    language | message
    ${'en'}  | ${en.email_not_in_use}
    ${'is'}  | ${is.email_not_in_use}
  `(
    'returns $message when attempting password reset for unknown email in language $language',
    async ({ language, message }) => {
      const response = await postPasswordReset('user1@mail.com', {
        language: language,
      });
      expect(response.body.message).toBe(message);
    },
  );

  it.each`
    language | message
    ${'en'}  | ${en.email_not_valid}
    ${'is'}  | ${is.email_not_valid}
  `(
    'returns 400 with validation err $message when attempting password reset for unknown email in language $language',
    async ({ language, message }) => {
      const response = await postPasswordReset(null, { language: language });
      expect(response.body.validationErrors.email).toBe(message);
      expect(response.status).toBe(400);
    },
  );

  it('returns 200 when a password reset is sucessful for a known email', async () => {
    const user = await addUser();
    const response = await postPasswordReset(user.email);
    expect(response.status).toBe(200);
  });

  it.each`
    language | message
    ${'en'}  | ${en.password_reset_request_success}
    ${'is'}  | ${is.password_reset_request_success}
  `(
    'returns message $message for sucessful password reset request in language $language',
    async ({ language, message }) => {
      const user = await addUser();
      const response = await postPasswordReset(user.email, {
        language: language,
      });
      expect(response.body.message).toBe(message);
      expect(response.status).toBe(200);
    },
  );

  it('creates a passwordResetToken when a password reset request is received from a known email', async () => {
    const user = await addUser();
    await postPasswordReset(user.email);
    const userInDB = await User.findOne({ where: { email: user.email } });
    expect(userInDB.passwordResetToken).toBeTruthy();
  });

  it('send a password rest mail with a passwordResetToken', async () => {
    const user = await addUser();
    await postPasswordReset(user.email);
    const userInDB = await User.findOne({ where: { email: user.email } });
    const passwordResetToken = userInDB.passwordResetToken;
    expect(lastMail).toContain('user1@mail.com');
    expect(lastMail).toContain(passwordResetToken);
  });

  it('returns 502 Bad Gateway when sending email fails', async () => {
    simulateSmtpFailure = true;
    const user = await addUser();
    const response = await postPasswordReset(user.email);
    expect(response.status).toBe(502);
  });

  it.each`
    language | message
    ${'en'}  | ${en.email_failure}
    ${'is'}  | ${is.email_failure}
  `(
    'returns message $message in language $language after e-mail failure',
    async ({ language, message }) => {
      simulateSmtpFailure = true;
      const user = await addUser();
      const response = await postPasswordReset(user.email, {
        language: language,
      });
      expect(response.body.message).toBe(message);
    },
  );
});

describe('Password Update', () => {
  it('returns 401 when a password reset request has the wrong token', async () => {
    const response = await putPasswordReset({
      password: 'P4ssword',
      passwordResetToken: 'abcde',
    });
    expect(response.status).toBe(403);
  });

  it.each`
    language | message
    ${'en'}  | ${en.unauthorised_password_reset}
    ${'is'}  | ${is.unauthorised_password_reset}
  `(
    'returns body constaining message $message after attempt to reset password with illegal token when language is $language ',
    async ({ language, message }) => {
      const response = await putPasswordReset(
        { password: 'P4ssword', passwordResetToken: 'abcde' },
        { language: language },
      );
      expect(response.body.message).toBe(message);
    },
  );

  it('returns 403 when password reset request has illegal password pattern and token is null', async () => {
    const response = await putPasswordReset({
      password: 'invalid',
      passwordResetToken: 'abcde',
    });
    expect(response.status).toBe(403);
  });

  it('returns 400 when password reset request has illegal password pattern but token is valid', async () => {
    const user = await addUser();
    user.passwordResetToken = 'test-token';
    await user.save();
    const response = await putPasswordReset({
      password: 'invalid',
      passwordResetToken: user.passwordResetToken,
    });
    expect(response.status).toBe(400);
  });

  it.each`
    language | value              | message
    ${'en'}  | ${null}            | ${en.password_not_null}
    ${'en'}  | ${'P4ss'}          | ${en.password_size}
    ${'en'}  | ${'alllowercase'}  | ${en.password_pattern}
    ${'en'}  | ${'MixedNonumber'} | ${en.password_pattern}
    ${'en'}  | ${'alllower1'}     | ${en.password_pattern}
    ${'en'}  | ${'ALLUPPER1'}     | ${en.password_pattern}
    ${'is'}  | ${null}            | ${is.password_not_null}
    ${'is'}  | ${'P4ss'}          | ${is.password_size}
    ${'is'}  | ${'alllowercase'}  | ${is.password_pattern}
    ${'is'}  | ${'MixedNonumber'} | ${is.password_pattern}
    ${'is'}  | ${'alllower1'}     | ${is.password_pattern}
    ${'is'}  | ${'ALLUPPER1'}     | ${is.password_pattern}
  `(
    'returns password validation error $message when $field is $value and language is $language',
    async ({ language, value, message }) => {
      const user = await addUser();
      user.passwordResetToken = 'test-token';
      await user.save();
      const response = await putPasswordReset(
        { password: value, passwordResetToken: user.passwordResetToken },
        { language: language },
      );
      expect(response.body.validationErrors.password).toBe(message);
    },

    it('returns 200 when valid password is sent with valid password token', async () => {
      const user = await addUser();
      user.passwordResetToken = 'test-token';
      await user.save();
      const response = await putPasswordReset({
        password: 'N3w-password',
        passwordResetToken: user.passwordResetToken,
      });
      expect(response.status).toBe(200);
    }),

    it('update the password in the databasewhen a valid password is sent with valid password token', async () => {
      const user = await addUser();
      user.passwordResetToken = 'test-token';
      await user.save();
      await putPasswordReset({
        password: 'N3w-password',
        passwordResetToken: user.passwordResetToken,
      });

      const userInDB = await User.findOne({
        where: {
          email: 'user1@mail.com',
        },
      });
      expect(userInDB.password).not.toEqual(user.password);
    }),

    it('clears the token from the database when a valid password is sent with valid password token', async () => {
      const user = await addUser();
      user.passwordResetToken = 'test-token';
      await user.save();
      await putPasswordReset({
        password: 'N3w-password',
        passwordResetToken: user.passwordResetToken,
      });

      const userInDB = await User.findOne({
        where: {
          email: 'user1@mail.com',
        },
      });
      expect(userInDB.passwordResetToken).toBeFalsy();
    }),

    it('activates and clears activation token when a valid password is sent with valid password token', async () => {
      const user = await addUser();
      user.passwordResetToken = 'test-token';
      user.inactive = true;
      user.activationToken = 'clear-me';
      await user.save();
      await putPasswordReset({
        password: 'N3w-password',
        passwordResetToken: user.passwordResetToken,
      });

      const userInDB = await User.findOne({
        where: {
          email: 'user1@mail.com',
        },
      });
      expect(userInDB.inactive).toBeFalsy();
      expect(userInDB.activationToken).toBeFalsy();
    }),

    it('activates and clears activation token when a valid password is sent with valid password token', async () => {
      const user = await addUser();
      user.passwordResetToken = 'test-token';
      user.inactive = true;
      user.activationToken = 'clear-me';
      await user.save();
      await putPasswordReset({
        password: 'N3w-password',
        passwordResetToken: user.passwordResetToken,
      });

      const userInDB = await User.findOne({
        where: {
          email: 'user1@mail.com',
        },
      });
      expect(userInDB.inactive).toBeFalsy();
      expect(userInDB.activationToken).toBeFalsy();
    }),

    it('clears all tokens of user after a valid password reset', async () => {
      const user = await addUser();
      user.passwordResetToken = 'test-token';
      await user.save();
      await Token.create({
        token: 'token-1',
        userid: user.id,
        lastUsedAt: Date.now(),
      });
      await putPasswordReset({
        password: 'N3w-password',
        passwordResetToken: user.passwordResetToken,
      });

      const tokens = await Token.findAll({
        where: {
          userid: user.id,
        },
      });
      expect(tokens.length).toBe(0);
    }),
  );
});
