/* eslint-disable no-undef */
const FileService = require('../src/file/FileService');
const fs = require('fs');
const path = require('path');
const config = require('config');

const {uploadDir, profileDir} = config;
const profileDirectory = path.join('.', uploadDir, 
  profileDir);

describe('createFolders', () => {

  it('create upload folders', () => {
    FileService.createFolders();
    const folderName = uploadDir;
    expect(fs.existsSync(folderName)).toBe(true);
  });

  it('creates profile folder under upload folder', () => {
    FileService.createFolders();
    const profileFolder = path.join('.', profileDirectory);
    expect(fs.existsSync(profileFolder)).toBe(true);


  });
});
