/* eslint-disable no-undef */
const Token = require('../src/auth/Token');
const TokenService = require('../src/auth/TokenService');
const sequelize = require('../src/config/database');

beforeAll(async () => {
  if(process.env.NODE_ENV === 'test') {
    await sequelize.sync();
  }
});

beforeEach(async () => {
  // true is changed to {cascade: true} for 
  // compatibilitywith databases other than sqlite  
  await Token.destroy({ truncate: true });
});

describe('Scheduled Token Cleanup', () => {
  it('clears the expired tokens with a scheduled task', async () => {
    jest.useFakeTimers();
    const token = 'test-token';
    const eightDaysAgoAgo = new Date(Date.now() - 8*24*60*60*1000);
    await Token.create({
        token: token,
        lastUsedAt: eightDaysAgoAgo,
    });
    
    await TokenService.scheduledCleanup();

    jest.advanceTimersByTime((60*60*1000) + 5000);
    const tokenInDB = await Token.findOne({ where: { token: token }});
    expect(tokenInDB).toBeNull();
  
  });

});

