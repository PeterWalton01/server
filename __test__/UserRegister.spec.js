/* eslint-disable no-undef */
const request = require('supertest');
const app = require('../src/app');
const User = require('../src/user/User');
const sequelize = require('../src/config/database');
// const nodemailerStub = require('nodemailer-stub');
// const EmailService = require('../src/email/EmailService');
const SMTPServer = require('smtp-server').SMTPServer;
const en = require('../locales/en/translation.json');
const is = require('../locales/is/translation.json');
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
});

const validUser = {
  username: 'user1',
  email: 'user1@mail.com',
  password: 'P4ssword',
};

const postUser = async (user = validUser, options = {}) => {
  const agent = request(app).post('/api/1.0/users');
  if (options.language) {
    agent.set('Accept-Language', options.language);
  }

  return await agent.send(user);
};

describe('User registration', () => {
  it('returns Ok 200 when signup request is valid', async () => {
    const response = await postUser();
    expect(response.status).toBe(200);
  });

  it('returns a success message when signup request is valid', async () => {
    const response = await postUser();
    expect(response.body.message).toBe(en.user_create_success);
  });

  it('it saves the user to the database', async () => {
    await postUser();
    const userList = await User.findAll();
    expect(userList.length).toBe(1);
  });

  it('saves username and email to the database', async () => {
    await postUser();
    const userList = await User.findAll();
    const savedUser = userList[0];
    expect(savedUser.username).toBe('user1');
    expect(savedUser.email).toBe('user1@mail.com');
  });

  it('hashes the password in the database', async () => {
    await postUser();
    const userList = await User.findAll();
    const savedUser = userList[0];
    expect(savedUser.password).not.toBe('P4ssword');
  });

  it('returns 400 when username is null', async () => {
    const response = await postUser({
      username: null,
      email: 'user1@mail.com',
      password: 'P4ssword',
    });
    expect(response.status).toBe(400);
  });

  it('returns a validationErrors field when validation fails', async () => {
    const response = await postUser({
      username: null,
      email: 'user1@mail.com',
      password: 'P4ssword',
    });
    const body = response.body;
    expect(body.validationErrors).not.toBeUndefined();
  });

  it.each([
    ['username', en.username_not_null],
    ['email', en.email_not_null],
    ['password', en.password_not_null],
  ])(
    'returns a %s cannot be null if a %s is null',
    async (field, expectedMessage) => {
      let user = {
        username: 'user1',
        email: 'user1@mail.com',
        password: 'P4ssword',
      };
      user[field] = null;
      const response = await postUser(user);
      const body = response.body;
      expect(body.validationErrors[field]).toBe(expectedMessage);
    },
  );

  it.each`
    field         | value              | expectedMessage
    ${'username'} | ${null}            | ${en.username_not_null}
    ${'username'} | ${'usr'}           | ${en.username_size}
    ${'username'} | ${'a'.repeat(33)}  | ${en.username_size}
    ${'email'}    | ${null}            | ${en.email_not_null}
    ${'email'}    | ${'mail.com'}      | ${en.email_not_valid}
    ${'email'}    | ${'mail@com'}      | ${en.email_not_valid}
    ${'email'}    | ${'fred.mail.com'} | ${en.email_not_valid}
    ${'password'} | ${null}            | ${en.password_not_null}
    ${'password'} | ${'P4ss'}          | ${en.password_size}
    ${'password'} | ${'alllowercase'}  | ${en.password_pattern}
    ${'password'} | ${'MixedNonumber'} | ${en.password_pattern}
    ${'password'} | ${'alllower1'}     | ${en.password_pattern}
    ${'password'} | ${'ALLUPPER1'}     | ${en.password_pattern}
  `(
    'returns $expectedMessage when $field is $value',
    async ({ field, value, expectedMessage }) => {
      let user = {
        username: 'user1',
        email: 'user1@mail.com',
        password: 'P4ssword',
      };
      user[field] = value;
      const response = await postUser(user);
      const body = response.body;
      expect(body.validationErrors[field]).toBe(expectedMessage);
    },
  );

  it('returns $is.email_in_use if there is an account using that Email', async () => {
    await User.create({ ...validUser });
    const response = await postUser(validUser);
    expect(response.body.validationErrors.email).toBe(en.email_in_use);
  });

  it('returns error messages for both user is null and email is in use', async () => {
    await User.create({ ...validUser });
    const response = await postUser({
      username: null,
      email: 'user1@mail.com',
      password: 'P4ssword',
    });
    const body = response.body;
    expect(Object.keys(body.validationErrors)).toEqual(['username', 'email']);
  });

  it('saves a user in inactive mode', async () => {
    await postUser();
    const users = await User.findAll();
    expect(users[0].inactive).toBe(true);
  });

  it('saves a user in inactive mode even if the body contain inactive as false', async () => {
    const newUser = { ...validUser, inactive: false };
    await postUser(newUser);
    const users = await User.findAll();
    expect(users[0].inactive).toBe(true);
  });

  it('creates a user token for new users', async () => {
    await postUser();
    const users = await User.findAll();
    expect(users[0].activationToken).toBeTruthy();
  });

  it('it sends an account activation email with a activationToken', async () => {
    await postUser();

    // const lastMail = nodemailerStub.interactsWithMail.lastMail();
    // expect(lastMail.to[0]).toBe('user1@mail.com');

    expect(lastMail).toContain('user1@mail.com');
    const user = await User.findAll();
    const savedUser = user[0];

    // expect(lastMail.content).toContain(savedUser.activationToken);
    expect(lastMail).toContain(savedUser.activationToken);
  });

  it('return 502 bad gateway when an email fails to send', async () => {
    // const mockSendAccountActivation = jest
    // .spyOn(EmailService, 'sendAccountActivation')
    // .mockRejectedValue({
    //   message: 'failed to deliver email',
    // });
    simulateSmtpFailure = true;
    const response = await postUser();
    // mockSendAccountActivation.mockRestore();
    expect(response.status).toBe(502);
  });

  it('returns email message failure when an email fails to send', async () => {
    simulateSmtpFailure = true;
    await postUser();
    const users = await User.findAll();
    expect(users.length).toBe(0);
  });

  it('does not save the user if the email fails to send', async () => {
    simulateSmtpFailure = true;
    const response = await postUser();
    expect(response.body.message).toBe(en.email_failure);
  });

  it('return a validation failure message in the error response body when validation fails', async () => {
    const response = await postUser({
      username: null,
      email: 'user1@mail.com',
      password: 'P4ssword',
    });
    expect(response.body.message).toBe(en.validation_failure);
  });
});

describe('internationalization', () => {
  it.each`
    field         | value              | expectedMessage
    ${'username'} | ${null}            | ${is.username_not_null}
    ${'username'} | ${'usr'}           | ${is.username_size}
    ${'username'} | ${'a'.repeat(33)}  | ${is.username_size}
    ${'email'}    | ${null}            | ${is.email_not_null}
    ${'email'}    | ${'mail.com'}      | ${is.email_not_valid}
    ${'email'}    | ${'mail@com'}      | ${is.email_not_valid}
    ${'email'}    | ${'fred.mail.com'} | ${is.email_not_valid}
    ${'password'} | ${null}            | ${is.password_not_null}
    ${'password'} | ${'P4ss'}          | ${is.password_size}
    ${'password'} | ${'alllowercase'}  | ${is.password_pattern}
    ${'password'} | ${'MixedNonumber'} | ${is.password_pattern}
    ${'password'} | ${'alllower1'}     | ${is.password_pattern}
    ${'password'} | ${'ALLUPPER1'}     | ${is.password_pattern}
  `(
    'returns $expectedMessage when $field is $value when language is íslensku',
    async ({ field, value, expectedMessage }) => {
      let user = {
        username: 'user1',
        email: 'user1@mail.com',
        password: 'P4ssword',
      };
      user[field] = value;
      const response = await postUser(user, { language: 'is' });
      const body = response.body;
      expect(body.validationErrors[field]).toBe(expectedMessage);
    },
  );

  it('returns $is.email_in_use if there is an account using that Email', async () => {
    await User.create({ ...validUser });
    const response = await postUser(validUser, { language: 'is' });
    expect(response.body.validationErrors.email).toBe(is.email_in_use);
  });

  it('returns a $is.user_create_success message when signup request is valid and language is set to Icelandic', async () => {
    const response = await postUser(validUser, { language: 'is' });
    expect(response.body.message).toBe(is.user_create_success);
  });

  it('returns $is.email_failure when an email fails to send', async () => {
    simulateSmtpFailure = true;
    const response = await postUser(validUser, { language: 'is' });
    expect(response.body.message).toBe(is.email_failure);
  });

  it('return a $is.validation_failure message in the error response body when validation fails', async () => {
    const response = await postUser(
      {
        username: null,
        email: 'user1@mail.com',
        password: 'P4ssword',
      },
      { language: 'is' },
    );
    expect(response.body.message).toBe(is.validation_failure);
  });
});

describe('Account activation', () => {
  it('activates the account when the cirrect token is sent', async () => {
    await postUser();
    let users = await User.findAll();
    token = users[0].activationToken;

    await request(app)
      .post('/api/1.0/users/token/' + token)
      .send();
    users = await User.findAll();
    expect(users[0].inactive).toBe(false);
  });

  it('removes the token from the user after a successful activation', async () => {
    await postUser();
    let users = await User.findAll();
    token = users[0].activationToken;

    await request(app)
      .post('/api/1.0/users/token/' + token)
      .send();
    users = await User.findAll();
    expect(users[0].activationToken).toBeFalsy();
  });

  it('does not activate the account if the token is wrong', async () => {
    await postUser();
    let users = await User.findAll();
    token = 'token-does-not-exist';

    await request(app)
      .post('/api/1.0/users/token/' + token)
      .send();
    users = await User.findAll();
    expect(users[0].inactive).toBe(true);
  });

  it('returns bad request (400) when the token is wrong', async () => {
    await postUser();
    token = 'token-does-not-exist';

    const response = await request(app)
      .post('/api/1.0/users/token/' + token)
      .send();
    users = await User.findAll();
    expect(response.status).toBe(400);
  });

  it.each`
    language | tokenStatus  | message
    ${'en'}  | ${'wrong'}   | ${en.account_activation_failure}
    ${'is'}  | ${'wrong'}   | ${is.account_activation_failure}
    ${'en'}  | ${'correct'} | ${en.account_activation_success}
    ${'is'}  | ${'correct'} | ${is.account_activation_success}
  `(
    'returns $message when the token is $tokenStatus and the language is $language',
    async ({ language, message, tokenStatus }) => {
      await postUser();
      let token = 'token-does-not-exist';
      if (tokenStatus === 'correct') {
        let users = await User.findAll();
        token = users[0].activationToken;
      }
      const response = await request(app)
        .post('/api/1.0/users/token/' + token)
        .set('Accept-Language', language)
        .send();
      users = await User.findAll();
      expect(response.body.message).toBe(message);
    },
  );
});

describe('Error model', () => {
  it('returns path, timestamp, message and validationErrors in response when there is a validation error', async () => {
    const response = await postUser({ ...validUser, username: null });
    const body = response.body;
    expect(Object.keys(body)).toEqual([
      'message',
      'validationErrors',
      'timestamp',
      'path',
    ]);
  });

  it('returns path, timestampand message when the failure is other than a validation error', async () => {
    token = 'token-does-not-exist';

    const response = await request(app)
      .post('/api/1.0/users/token/' + token)
      .send();
    users = await User.findAll();
    const body = response.body;

    expect(Object.keys(body)).toEqual(['message', 'timestamp', 'path']);
  });

  it('returns path in the error body', async () => {
    token = 'token-does-not-exist';
    const response = await request(app)
      .post('/api/1.0/users/token/' + token)
      .send();
    users = await User.findAll();
    const body = response.body;

    expect(body.path).toEqual('/api/1.0/users/token/' + token);
  });

  it('returns timestamp in milliseconds in the response body within 5 seconds ', async () => {
    const timeNowInMilli = new Date().getTime();
    const timeInFiveSeconds = timeNowInMilli + 5 * 1000;
    token = 'token-does-not-exist';
    const response = await request(app)
      .post('/api/1.0/users/token/' + token)
      .send();
    users = await User.findAll();
    const body = response.body;

    expect(body.timestamp).toBeGreaterThan(timeNowInMilli);
    expect(body.timestamp).toBeLessThan(timeInFiveSeconds);
  });
});
