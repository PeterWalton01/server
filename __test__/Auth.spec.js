/* eslint-disable no-undef */
const request = require('supertest');
const app = require('../src/app');
const User = require('../src/user/User');
const Token = require('../src/auth/Token');
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
  // compatibilitywith databases other than sqlite  
  await User.destroy({ truncate: {cascade: true} });
});


const activeUser = { username: 'user1', email: 'user1@mail.com',
                     password: 'P4ssword', inactive: false,
};

const addUser = async (user = {...activeUser}) => {
  const hash = await bcrypt.hash(user.password, 10);
  user.password = hash;
  return await User.create(user);
};

const postAuthentication = async (credentials, options = {}) => {
  const agent = request(app).post('/api/1.0/auth');
  if (options.language) {
    agent.set('Accept-Language', options.language);
  }
  return await agent.send(credentials);
};

const postLogout = async (options = {}) => {
  const agent = request(app).post('/api/1.0/logout');
  if(options.token){
    agent.set('authorization', `Bearer ${options.token}`);
  }
return await agent.send();

};

describe('Authentication', () => {
  it('returns 200 when authentication details are valid', async () => {
    await addUser();
    const response = await postAuthentication({
      email: 'user1@mail.com',
      password: 'P4ssword',
    });
    expect(response.status).toBe(200);
  });

  it('returns a user id, username,token and image in response to a successful login', async () => {
    const user = await addUser();
    const response = await postAuthentication({
      email: 'user1@mail.com',
      password: 'P4ssword',
    });
    const body = response.body;
    expect(body.id).toBe(user.id);
    expect(body.username).toBe(user.username);
    expect(Object.keys(body)).toEqual(['id', 'username', 'token', 'image']);
  });

  it('returns 401 when the user given does not exist', async () => {
    const response = await postAuthentication({
      email: 'user1@mail.com',
      password: 'P4ssword',
    });
    expect(response.status).toBe(401);
  });

  it('returns a proper error body when the logon fails', async () => {
    const nowInMili = new Date().getTime();
    const response = await postAuthentication({
      email: 'user1@mail.com',
      password: 'P4ssword',
    });
    const err = response.body;
    expect(err.path).toBe('/api/1.0/auth');
    expect(err.timestamp).toBeGreaterThan(nowInMili);
    expect(Object.keys(err)).toEqual(['message', 'timestamp', 'path']);
  });

  it.each`
    language | message
    ${'en'}  | ${en.authentication_failure}
    ${'is'}  | ${is.authentication_failure}
  `(
    'returns a $message when the login fails and the language is $language',
    async ({ language, message }) => {
      const response = await postAuthentication(
        {
          email: 'user1@mail.com',
          password: 'P4ssword',
        },
        { language },
      );
      const err = response.body;
      expect(err.message).toBe(message);
    },
  );

  it('returns 401 when the password is incorrect', async () => {
    await addUser();
    const response = await postAuthentication({
      email: 'user1@mail.com',
      password: 'P4sswor',
    });

    expect(response.status).toBe(401);
  });

  it('returns 403 when logging in with an inactive account', async () => {
    await addUser({...activeUser, inactive: true});
    const response = await postAuthentication({
      email: 'user1@mail.com',
      password: 'P4ssword', 
    });

    expect(response.status).toBe(403);
  });

  it('returns a proper error body when logging in with an inactive accoun', async () => {
    await addUser({...activeUser, inactive: true});
    const nowInMili = new Date().getTime();
    const response = await postAuthentication({
      email: 'user1@mail.com',
      password: 'P4ssword',
    });
    const err = response.body;
    expect(err.path).toBe('/api/1.0/auth');
    expect(err.timestamp).toBeGreaterThan(nowInMili);
    expect(Object.keys(err)).toEqual(['message', 'timestamp', 'path']);
  });

  it.each`
  language | message
  ${'en'}  | ${en.authentication_failure}
  ${'is'}  | ${is.authentication_failure}
`(
  'returns a $message when the login fails and the language is $language',
  async ({ language, message }) => {
    const response = await postAuthentication(
      {
        email: 'user1@mail.com',
        password: 'P4ssword',
      },
      { language },
    );
    const err = response.body;
    expect(err.message).toBe(message);
  },
);

  it('returns 401 when the email os not valid', async () => {
    const response = await postAuthentication({
      password: 'P4ssword',
    });

    expect(response.status).toBe(401);
  });

  it('returns 401 when the password os not valid', async () => {
    const response = await postAuthentication({
      email: 'user1@mail.com',
    });

    expect(response.status).toBe(401);
  });

  it('retruns a token in response body when credential are correct', 
    async () => {
      await addUser({...activeUser});
      const response = await postAuthentication({
        email: 'user1@mail.com',
        password: 'P4ssword',
      });
  
      expect(response.body.token).not.toBeUndefined();    
  });


});

describe('Logout', () => {

  it('returns 200  when an unauthorised login requests logout', async () => {
    const response = await postLogout();
    expect(response.status).toBe(200);

  });

  it('returns token from the database during logout', async () => {
     await addUser();
     const response = await postAuthentication({email: 'user1@mail.com', password: 'P4ssword'});
     const token = response.body.token;
     await postLogout({token: token});
     const storedToken = await Token.findOne({where: {token : token}});
     expect(storedToken).toBeNull();
  });
});

describe('Token Expiration', () => {

  const putUser = async (id = 5, body = null, options = {}) => {

    let agent = request(app); 
  
    agent = request(app).put('/api/1.0/users/' + id);
    if(options.token) {
      agent.set('Authorization', `Bearer ${options.token}`);
    };
    return await agent.send(body);
  };

  it('returns 403 when token is older than one week', async () => {
    const savedUser = await addUser();

    const token = 'test-token';
    const oneWeekAgo = new Date(Date.now() - 7*24*60*60*1000 - 1);
    await Token.create({
      token: token,
      userid: savedUser.id,
      lastUsedAt: oneWeekAgo,
    });

    const validUpdate = { username: 'user1-updated'};
    const response = await putUser(savedUser.id, validUpdate, { token: token });
    expect(response.status).toBe(403);

  });

  it('refreshes lastUsedAt then an unexpired token is used', async () => {
    const savedUser = await addUser();

    const token = 'test-token';
    const fourDaysAgo = new Date(Date.now() - 4*24*60*60*1000);
    await Token.create({
      token: token,
      userid: savedUser.id,
      lastUsedAt: fourDaysAgo,
    });

    const validUpdate = { username: 'user1-updated'};
    const rightBeforeSendingRequest = new Date();
    await putUser(savedUser.id, validUpdate, { token: token });
    const tokenInDB = await Token.findOne({ where: { token: token } });
    expect(tokenInDB.lastUsedAt.getTime())
          .toBeGreaterThan(rightBeforeSendingRequest.getTime());
  });

  it('refreshes lastUsedAt then an unexpired token is used at unauthenticated endpoint', async () => {
    const savedUser = await addUser();

    const token = 'test-token';
    const fourDaysAgo = new Date(Date.now() - 4*24*60*60*1000);
    await Token.create({
      token: token,
      userid: savedUser.id,
      lastUsedAt: fourDaysAgo,
    });

    const rightBeforeSendingRequest = new Date();
    await request(app).get('/api/1.0/users/5')
       .set('Authorization', `Bearer ${token}`);
    const tokenInDB = await Token.findOne({ where: { token: token } });
    expect(tokenInDB.lastUsedAt.getTime())
          .toBeGreaterThan(rightBeforeSendingRequest.getTime());
  });
});
