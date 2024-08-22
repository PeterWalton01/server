const nodemailer = require('nodemailer');
const transporter = require('../config/emailTransporter');
const logger = require('../shared/logger');

let info;
const sendAccountActivation = async (email, activationToken) => {

  info = await transporter.sendMail({
    from: 'systekdataservices at <systekdataservices@gmail.com>',
    to: email,
    subject: 'Activation email',
    html: `
    <div>
       <b>Please click the link below to activate your account</b>
    </div>
    <div>
      <a href="http://localhost:8080/#/login?token=${activationToken}">Activate</a>
    </div>`,
  });

    logger.info('url: ' + nodemailer.getTestMessageUrl(info));

};


const sendPasswordReset = async (email, token) => {
  info = await transporter.sendMail({
    from: 'systekdataservices at <systekdataservices@gmail.com>',
    to: email,
    subject: 'Password Reset',
    html: `
    <div>
       <b>Please click the link below to reset your password</b>
    </div>
    <div>
      <a href="http://localhost:8080/#/password-reset?reset=${token}">Reset</a>
    </div>`,
  });

    logger.info('url: ' + nodemailer.getTestMessageUrl(info));
};


module.exports = { sendAccountActivation, sendPasswordReset };
