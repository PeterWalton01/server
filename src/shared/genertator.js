const crypto = require('crypto');

const randomString = (length) => {
    // hex doubles the length hence the use of substring
    return crypto.randomBytes(length).toString('hex').substring(length);
  };

  module.exports = { randomString };