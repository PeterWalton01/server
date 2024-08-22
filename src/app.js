const express = require('express');
// var bodyParser = require('body-parser');
const UserRouter = require('./user/UserRouter');
const AuthenticationRouter = require('./auth/AuthenticationRouter');
const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
const middleware = require('i18next-http-middleware');
const ErrorHandler = require('./error/ErrorHandler');
const tokenAuthentication = require('./middleware/tokenAuthentication');
const path = require('path');
const config = require('config');
const FileService = require('./file/FileService'); 

const {uploadDir, profileDir} = config;
const profileDirectory = path.join('.', uploadDir, 
  profileDir);

const ONE_YEAR_IN_MILLIS = 365 * 24 * 60 *60 *1000;

i18next
  .use(Backend)
  .use(middleware.LanguageDetector)
  .init({
    fallbackLng: 'en',
    lng: 'en',
    ns: ['translation'],
    defaultNS: 'translation',
    backend: {
      loadPath: './locales/{{lng}}/{{ns}}.json',
    },
    detection: {
      lookupHeader: 'accept-language',
    },
  });

FileService.createFolders();

const app = express();
// var jsonParser = bodyParser.json();
app.use(middleware.handle(i18next));

// limit in next statment applies to base24 images
app.use(express.json({limit: '3mb'}));

app.use('/images', express.static(profileDirectory, 
      {maxAge: ONE_YEAR_IN_MILLIS}
));

app.use(tokenAuthentication);

app.use(UserRouter);
app.use(AuthenticationRouter);

// Error handler to come after routing
app.use(ErrorHandler);

module.exports = app;
