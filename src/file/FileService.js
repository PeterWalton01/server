const fs = require('fs');
const path = require('path');
const config = require('config');
const FileType = require('file-type-cjs');
const { randomString } = require('../shared/genertator'); 

const {uploadDir, profileDir} = config;
const profileFolder = path.join('.', uploadDir, profileDir);

const createFolders = () => {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
  }
  if (!fs.existsSync(profileFolder)) {
    fs.mkdirSync(profileFolder);
  }
};

const saveProfileImage = async (base64File) => {
   const filename = randomString(32);
   if(!base64File) {
    base64File = 'None';
   }
   const filePath = path.join('.', profileFolder, 
         filename);
   await fs.promises.writeFile(filePath, base64File, 
      {encoding: 'base64'});
   return filename;
  //  return new Promise((resolve, reject) => {
  //    fs.writeFile(filePath, base64File, {encoding: 'base64'},
  //      (error) => {
  //        if(!error) {
  //         resolve(filename);
  //        } else {
  //         reject('');
  //        }
  //     }
  //   );
  //  });

};

const deleteProfileImage = async (filename) => {
  const filePath = path.join('.', profileFolder, filename);
  await fs.promises.unlink(filePath);
};

const isLessThan2mb = (buffer) => {
  return buffer.length < 2 * 1024 * 1024;
};

const isSupportedFileType = async (buffer) => {
  try {
    const type = await FileType.fromBuffer(buffer);
    if(!type || (type.mime !== 'image/png' 
      && type.mime !== 'image/jpeg'))
    {
       throw new Error('unsupported_file_type');
    }
  // eslint-disable-next-line no-unused-vars
  } catch (err) {
    throw new Error('unsupported_file_type');
  }
};

module.exports = { createFolders, 
                   saveProfileImage, 
                   deleteProfileImage,
                   isLessThan2mb,
                   isSupportedFileType,
                   };
