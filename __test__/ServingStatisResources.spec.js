/* eslint-disable no-undef */
const request = require('supertest');
const app = require('../src/app');
const config = require('config');
const path = require('path');
const fs = require('fs');

const {uploadDir, profileDir} = config;
const profileDirectory = path.join('.', uploadDir, 
  profileDir);

describe('Profile Images', () => {

   const copyFile = () => {
    const filePath = path.join('.', '__test__', 
        'resources', 'test-png.png');
    storeFileName = 'test-file';
    const targetPath = path.join(profileDirectory, storeFileName);
    fs.copyFileSync(filePath, targetPath);
    return storeFileName;
   };

    it('returns 404 when file is not found', async () => {
       const response = await  request(app).get('/images/12345');
       expect(response.status).toBe(404);

    });

    it('returns 200 when file exists', async () => {
        const storeFileName = copyFile();
        
        const response = await  request(app).get(`/images/${storeFileName}`);
        expect(response.status).toBe(200);
    });

    it('returns cached data for 1 year', async () => {
        const storeFileName = copyFile();
        
        const response = await  request(app).get(`/images/${storeFileName}`);
        const oneYearInSeconds = 365 * 24 * 60 * 60;
        expect(response.header['cache-control'])
            .toContain(`max-age=${oneYearInSeconds}`);
    });
});