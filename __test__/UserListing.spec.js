/* eslint-disable no-undef */
const request = require('supertest');
const app = require('../src/app');
const User = require('../src/user/User');
const sequelize = require('../src/config/database');
const bcrypt = require('bcrypt');
const en = require('../locales/en/translation.json');
const is = require('../locales/is/translation.json');

beforeAll(async () => {
  if(process.env.NODE_ENV === 'test') {
    await sequelize.sync();
  }
});

beforeEach(async () => {
  // true is changed to {cascade: true} for 
  // compatibility with databases other than sqlite  
  await User.destroy({ truncate: {cascade: true} });
});

const auth = async (options = {}) => {
  let token;

  if (options.auth) {
    const response = 
        await request(app).post('/api/1.0/auth').send(options.auth);
    token = response.body.token;
    return token;
  }
};

const getUsers = (options = {}) => {
  let agent = request(app).get('/api/1.0/users');
  if (options.token) {
    agent.set('Authorization', `Bearer ${options.token}`);
  }
  return agent;
};

const addUser = async (activeUserCount, inActiveUserCount = 0) => {
  const hash = await bcrypt.hash('P4ssword', 10);
  const total = activeUserCount + inActiveUserCount;
  for (let i = 0; i < total; i++) {
    await User.create({
      username: `user${i + 1}`,
      email: `user${i + 1}@mail.com`,
      password: hash,
      inactive: i >= activeUserCount,
    });
  }
};

describe('Listing users', () => {
  it('returns 200 if there are no users in the database', async () => {
    const response = await getUsers();
    expect(response.status).toBe(200);
  });

  it('returns a page object', async () => {
    const response = await getUsers();
    expect(response.body).toEqual({
      content: [],
      page: 0,
      size: 10,
      totalPages: 0,
    });
  });

  it('returns 10 users when there are 11 in the database', async () => {
    await addUser(11);
    const response = await getUsers();
    expect(response.body.content.length).toBe(10);
  });

  it('returns 5 users where the are 5 active and 6 inactive uses in the database', async () => {
    await addUser(5, 6);
    const response = await getUsers();
    expect(response.body.content.length).toBe(5);
  });

  it('returns only id, username, email and image in the response', async () => {
    await addUser(11);
    const response = await getUsers();
    const user = response.body.content[0];
    expect(Object.keys(user)).toEqual(['id', 'username', 'email', 'image']);
  });

  it('returns 2 page when th database contains 15 active and 7 inactive users', async () => {
    await addUser(15, 7);
    const response = await getUsers();
    const pages = response.body.totalPages;
    expect(pages).toBe(2);
  },10000);

  it('returns the second page when page is set to 1 in the request', async () => {
    await addUser(11);
    const response = await getUsers().query({ page: 1 });
    // const response = await request(app).get('/api/1.0/users')
    //       .query({page: 1});
    expect(response.body.content[0].username).toBe('user11');
    expect(response.body.page).toBe(1);
  });

  it('returns the first page when page is set below zero in the request', async () => {
    await addUser(11);
    const response = await getUsers().query({ page: -5 });
    expect(response.body.page).toBe(0);
  });

  it('returns 5 users and a size indicator of 5 when this is set in the request', async () => {
    await addUser(11);
    const response = await getUsers().query({ size: 5 });
    expect(response.body.content.length).toBe(5);
    expect(response.body.size).toBe(5);
  });

  it('returns 10 users when the requested size is 1999', async () => {
    await addUser(12);
    const response = await getUsers().query({ size: 1000 });
    expect(response.body.content.length).toBe(10);
    expect(response.body.size).toBe(10);
  });

  it('returns 10 users and page size value of 10 when the requested size is less than or equal 0', async () => {
    await addUser(12);
    const response = await getUsers().query({ size: -50 });
    expect(response.body.content.length).toBe(10);
    expect(response.body.size).toBe(10);
  });

  it('returns 10 users and page size value of 10 when neither parameter is specified', async () => {
    await addUser(12);
    const response = await getUsers();
    expect(response.body.content.length).toBe(10);
    expect(response.body.size).toBe(10);
    expect(response.body.page).toBe(0);
  });

  it('returns 10 users and page size value of 10 when parameters are illegal', async () => {
    await addUser(12);
    const response = await getUsers().query({ page: 'page', size: 'size' });
    expect(response.body.content.length).toBe(10);
    expect(response.body.size).toBe(10);
    expect(response.body.page).toBe(0);
  });

  it('returns a user page without any logged in user', async () => {
    await addUser(11);
    const token = await auth({
      auth: { email: 'user1@mail.com', password: 'P4ssword' },
    });
    const response = await getUsers({ token: token });
    expect(response.body.totalPages).toBe(1);
  });
});

describe('Get user', () => {
  const getUser = (id = 5) => {
    return request(app).get('/api/1.0/users/' + id);
  };

  it('returns 404 when a user is not found', async () => {
    const response = await getUser();
    expect(response.status).toBe(404);
  });

  it.each`
    language | message
    ${'en'}  | ${en.user_not_found}
    ${'is'}  | ${is.user_not_found}
  `(
    'returns $message for an unknown user when the language is $language',
    async ({ language, message }) => {
      const response = await getUser().set('Accept-Language', language);
      expect(response.body.message).toBe(message);
    },
  );

  it('returns proper error body when the user not found', async () => {
    const nowInMilis = new Date().getTime();
    const response = await getUser();
    const error = response.body;
    expect(error.path).toBe('/api/1.0/users/5');
    expect(error.timestamp).toBeGreaterThan(nowInMilis);
    expect(Object.keys(error)).toEqual(['message', 'timestamp', 'path']);
  });

  it('it returns 200 when an active user exists', async () => {
    const user = await User.create({
      username: 'user1',
      email: 'user1@mail.com',
      inactive: false,
    });
    const addedUser = await getUser(user.id);
    expect(addedUser.status).toBe(200);
  });

  it('it returns id, username, email and image when an active user exists', async () => {
    const user = await User.create({
      username: 'user1',
      email: 'user1@mail.com',
      inactive: false,
    });
    const addedUser = await getUser(user.id);
    expect(Object.keys(addedUser.body)).toEqual(['id', 'username', 'email', 'image']);
  });

  it('it returns 404 when an inactive user exists', async () => {
    const user = await User.create({
      username: 'user1',
      email: 'user1@mail.com',
      inactive: true,
    });
    const addedUser = await getUser(user.id);
    expect(addedUser.status).toBe(404);
  });
});
