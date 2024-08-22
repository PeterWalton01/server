/* eslint-disable no-undef */
const request = require('supertest');
const app = require('../src/app');
const User = require('../src/user/User');
const sequelize = require('../src/config/database');
const en = require('../locales/en/translation.json');
const is = require('../locales/is/translation.json');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const config = require('config');

const { uploadDir, profileDir } = config;
const profileDirectory = path.join('.', uploadDir, profileDir);

beforeAll(async () => {
  if(process.env.NODE_ENV === 'test') {
    await sequelize.sync();
  }
});

beforeEach(async () => {
  // true is changed to {cascade: true} for
  // compatibility with databases other than sqlite
  await User.destroy({ truncate: { cascade: true } });
});

afterAll(() => {
  const files = fs.readdirSync(profileDirectory);
  for (const file of files) {
    fs.unlinkSync(path.join(profileDirectory, file));
  }
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

const putUser = async (id = 5, body = null, options = {}) => {
  let agent = request(app);
  let token;

  if (options.auth) {
    const response = await agent.post('/api/1.0/auth').send(options.auth);
    token = response.body.token;
  }

  agent = request(app).put('/api/1.0/users/' + id);
  if (options.language) {
    agent.set('Accept-Language', options.language);
  }
  if (token) {
    agent.set('Authorization', `Bearer ${token}`);
  }
  if (options.token) {
    agent.set('Authorization', `Bearer ${options.token}`);
  }
  const response = await agent.send(body);
  return response;
};

const readFileAsBase64 = (file = 'test-png.png') => {
  const filePath = path.join('.', '__test__', 'resources', file);
  return fs.readFileSync(filePath, { encoding: 'base64' });
};

describe('User Update', () => {
  it('response forbidden when there is an update request without authorisation', async () => {
    const response = await putUser();
    expect(response.status).toBe(403);
  });

  it.each`
    language | message
    ${'en'}  | ${en.unauthorised_user_update}
    ${'is'}  | ${is.unauthorised_user_update}
  `(
    'sends a forbidden response contains a message $message when the language is $language',
    async ({ language, message }) => {
      const timeInMili = new Date().getTime();
      const response = await putUser((id = 5), null, { language });

      expect(response.body.timestamp).toBeGreaterThan(timeInMili);
      expect(response.body.path).toBe('/api/1.0/users/5');
      expect(response.body.message).toBe(message);
    },
  );

  it('returns forbidden responce when update is requested without credentials', async () => {
    await addUser();
    const response = putUser(5, null, {
      auth: { email: 'user1000@mail.com', password: 'P4ssword' },
    });
    expect((await response).status).toBe(403);
  });

  it('returns forbidden responce when update is requested with incorrect password', async () => {
    await addUser();
    const response = putUser(5, null, {
      auth: { email: 'user1@mail.com', password: 'P4sswor' },
    });
    expect((await response).status).toBe(403);
  });

  it('returns forbidden in responee when credentials are correct but user is      different ', async () => {
    await addUser();
    const userToBeUpdate = await addUser({
      ...activeUser,
      username: 'user2',
      email: 'user2@mail.com',
    });
    const response = putUser(userToBeUpdate.id, null, {
      auth: { email: 'user1@mail.com', password: 'P4ssword' },
    });
    expect((await response).status).toBe(403);
  });

  it('returns forbidden in responee when credentials are correct but user is      inactive ', async () => {
    const inactiveUser = await addUser({ ...activeUser, inactive: true });
    const response = putUser(inactiveUser.id, null, {
      auth: { email: 'user1@mail.com', password: 'P4ssword' },
    });
    expect((await response).status).toBe(403);
  });

  it('return 200 for a sucessful update for an authorised user', async () => {
    const savedUser = await addUser();
    const validUpdate = { username: 'user1-updated' };
    const response = await putUser(savedUser.id, validUpdate, {
      auth: { email: 'user1@mail.com', password: 'P4ssword' },
    });
    expect(response.status).toBe(200);
  });

  it('updates username when requested by an authorised user', async () => {
    const savedUser = await addUser();
    const validUpdate = { username: 'user1-updated' };
    await putUser(savedUser.id, validUpdate, {
      auth: { email: 'user1@mail.com', password: 'P4ssword' },
    });
    const updatedUser = await User.findOne({ where: { id: savedUser.id } });
    expect(updatedUser.username).toBe(validUpdate.username);
  });

  it('returns 403 when the token is not valid', async () => {
    const response = await putUser(5, null, { token: '123' });
    expect(response.status).toBe(403);
  });

  it('saves the user image when update contains image as base64', async () => {
    const fileInBase64 = readFileAsBase64();
    const savedUser = await addUser();
    const validUpdate = { username: 'user1-updated', image: fileInBase64 };
    const response = await putUser(savedUser.id, validUpdate, {
      auth: { email: 'user1@mail.com', password: 'P4ssword' },
    });
    expect(Object.keys(response.body)).toEqual([
      'id',
      'username',
      'email',
      'image',
    ]);
  });

  it('returns success body containing only id, username, email and image', async () => {
    const fileInBase64 = readFileAsBase64();
    const savedUser = await addUser();
    const validUpdate = { username: 'user1-updated', image: fileInBase64 };
    await putUser(savedUser.id, validUpdate, {
      auth: { email: 'user1@mail.com', password: 'P4ssword' },
    });
    const updatedUser = await User.findOne({ where: { id: savedUser.id } });
    expect(updatedUser.image).toBeTruthy();
  });

  it('saves the user image to the upload folder and stores the path in the image field', async () => {
    const fileInBase64 = readFileAsBase64();
    const savedUser = await addUser();
    const validUpdate = { username: 'user1-updated', image: fileInBase64 };
    const response = await putUser(savedUser.id, validUpdate, {
      auth: { email: 'user1@mail.com', password: 'P4ssword' },
    });
    const userInDB = response.body;
    const profileImagePath = path.join('.', profileDirectory, userInDB.image);
    expect(fs.existsSync(profileImagePath)).toBe(true);
  });

  it('removes the old image when a new one is uploaded', async () => {
    const fileInBase64 = readFileAsBase64();
    const savedUser = await addUser();
    const validUpdate = { username: 'user1-updated', image: fileInBase64 };
    const response = await putUser(savedUser.id, validUpdate, {
      auth: { email: 'user1@mail.com', password: 'P4ssword' },
    });
    const firstImage = response.body.image;

    await putUser(savedUser.id, validUpdate, {
      auth: { email: 'user1@mail.com', password: 'P4ssword' },
    });

    const profileImagePath = path.join('.', profileDirectory, firstImage);
    expect(fs.existsSync(profileImagePath)).toBe(false);
  });

  it.each`
    language | value             | message
    ${'en'}  | ${null}           | ${en.username_not_null}
    ${'en'}  | ${'usr'}          | ${en.username_size}
    ${'en'}  | ${'a'.repeat(33)} | ${en.username_size}
    ${'is'}  | ${null}           | ${is.username_not_null}
    ${'is'}  | ${'usr'}          | ${is.username_size}
    ${'is'}  | ${'a'.repeat(33)} | ${is.username_size}
  `(
    'bad request with message $message when an update with an illegal usernmae is attmpted in language $language',
    async ({ language, value, message }) => {
      const savedUser = await addUser();
      const invalidUpdate = { username: value };
      const response = await putUser(savedUser.id, invalidUpdate, {
        auth: { email: 'user1@mail.com', password: 'P4ssword' },
        language: language,
      });
      expect(response.body.validationErrors.username).toBe(message);
      expect(response.status).toBe(400);
    },
  );

  it('returns 200 when the image is exactly 2mb', async () => {
    // Need a 2mb file in base64 format
    // with a png magic number near the start
    const testPng = readFileAsBase64(); // has magic in base64
    // calculate filling
    const testPngSize = Buffer.from(testPng, 'base64').length;
    const filling = 'a'.repeat(1024 * 1024 * 2 - testPngSize);
    const fillingBase64 = Buffer.from(filling).toString('base64');
    const fileInBase64 = testPng + fillingBase64;

    const savedUser = await addUser();
    const validUpdate = { username: 'user1-updated', image: fileInBase64 };
    const response = await putUser(savedUser.id, validUpdate, {
      auth: { email: 'user1@mail.com', password: 'P4ssword' },
    });
    expect(response.status).toBe(200);
  });

  it('returns 400 when the image is larger than 2mb', async () => {
    const fileWithSize2mbPlus = 'a'.repeat(1024 * 1024 * 2) + 'a';
    const fileInBase64 = Buffer.from(fileWithSize2mbPlus).toString('base64');
    const savedUser = await addUser();
    const invalidUpdate = { username: 'user1-updated', image: fileInBase64 };
    const response = await putUser(savedUser.id, invalidUpdate, {
      auth: { email: 'user1@mail.com', password: 'P4ssword' },
    });
    expect(response.status).toBe(400);
  });

  it('keeps the old image if the user only updates the username', async () => {
    const fileInBase64 = readFileAsBase64();
    const savedUser = await addUser();
    const validUpdate = { username: 'user1-updated', image: fileInBase64 };
    const response = await putUser(savedUser.id, validUpdate, {
      auth: { email: 'user1@mail.com', password: 'P4ssword' },
    });
    const firstImage = response.body.image;

    await putUser(
      savedUser.id,
      { username: 'user1-updated2' },
      {
        auth: { email: 'user1@mail.com', password: 'P4ssword' },
      },
    );

    const profileImagePath = path.join('.', profileDirectory, firstImage);
    expect(fs.existsSync(profileImagePath)).toBe(true);

    const userInDB = await User.findOne({ where: { id: savedUser.id } });
    expect(userInDB.image).toBe(firstImage);
  });

  it.each`
    language | message
    ${'en'}  | ${en.profile_image_size}
    ${'is'}  | ${is.profile_image_size}
  `(
    'returns a message $message when a upload of a profile image larger than 2mb when in the language $language',
    async ({ language, message }) => {
      const fileWithSize2mbPlus = 'a'.repeat(1024 * 1024 * 2) + 'a';
      const fileInBase64 = Buffer.from(fileWithSize2mbPlus).toString('base64');
      const savedUser = await addUser();
      const invalidUpdate = { username: 'user1-updated', image: fileInBase64 };
      const response = await putUser(savedUser.id, invalidUpdate, {
        auth: { email: 'user1@mail.com', password: 'P4ssword' },
        language: language,
      });
      expect(response.body.validationErrors.image).toBe(message);
    },
  );

  // ${'test-jpg.jpg'} | ${''}

  // ${'test-png.png'} | ${''}
  it.each`
    file              | status
    ${'test-gif.gif'} | ${400}
    ${'test-pdf.pdf'} | ${400}
    ${'test-txt.txt'} | ${400}
    ${'test-jpg.jpg'} | ${200}
    ${'test-png.png'} | ${200}
  `(
    'returns status $status when file $file is uploaded',
    async ({ file, status }) => {
      const fileInBase64 = readFileAsBase64(file);
      const savedUser = await addUser();
      const updateBody = { username: 'user1-updated', image: fileInBase64 };
      const response = await putUser(savedUser.id, updateBody, {
        auth: { email: 'user1@mail.com', password: 'P4ssword' },
      });
      expect(response.status).toBe(status);
    },
  );

  it.each`
    file              | language | message
    ${'test-gif.gif'} | ${'en'}  | ${en.unsupported_file_type}
    ${'test-pdf.pdf'} | ${'en'}  | ${en.unsupported_file_type}
    ${'test-txt.txt'} | ${'en'}  | ${en.unsupported_file_type}
    ${'test-gif.gif'} | ${'is'}  | ${is.unsupported_file_type}
    ${'test-pdf.pdf'} | ${'is'}  | ${is.unsupported_file_type}
    ${'test-txt.txt'} | ${'is'}  | ${is.unsupported_file_type}
    
  `('returns message $message when uploading a $file type file as an image when in language $language', async ({file, language, message}) => {
    const fileInBase64 = readFileAsBase64(file);
    const savedUser = await addUser();
    const updateBody = { username: 'user1-updated', image: fileInBase64 };
    const response = await putUser(savedUser.id, updateBody, {
      auth: { email: 'user1@mail.com', password: 'P4ssword' },
      language : language,
    });
    expect(response.body.validationErrors.image).toBe(message);  

  });
});
