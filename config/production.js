module.exports = {
  'database': {
    'database': 'hoaxify',
    'username': 'my-db-user',
    'password': 'db-pass',
    'dialect': 'sqlite',
    'storage': './prod-db.sqlite',
    'logging': false
  },
  mail: {
    service: 'Gmail',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: 'systekdataservices@gmail.com',
      pass: 'tckrxsupevupbplw',
    },
  },
  uploadDir: 'uploads-production',
  profileDir: 'profile',
};
