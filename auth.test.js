const request = require('supertest');
const bcrypt = require('bcryptjs');

// Set test env BEFORE requiring the app so it picks up DATA_FILE and admin creds
process.env.DATA_FILE = 'data.test.json';
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync('testpass', 10);

const app = require('./backend-example');
const fs = require('fs');

beforeEach(() => {
  // ensure a clean data file
  if (fs.existsSync('data.test.json')) fs.unlinkSync('data.test.json');
  fs.writeFileSync('data.test.json', JSON.stringify({ leads: [], passes: [], venues: [], models: [], events: [] }));
});

afterAll(() => {
  if (fs.existsSync('data.test.json')) fs.unlinkSync('data.test.json');
});

test('protected admin routes require login and allow after login', async () => {
  // should be unauthorized before login
  const r1 = await request(app).get('/api/admin/models');
  expect(r1.status).toBe(401);

  // login
  const login = await request(app)
    .post('/api/admin/login')
    .send({ username: 'admin', password: 'testpass' });

  expect(login.status).toBe(200);
  expect(login.body && login.body.success).toBe(true);

  // capture cookie
  const cookie = login.headers['set-cookie'];
  expect(cookie).toBeDefined();

  // access protected route with cookie
  const r2 = await request(app).get('/api/admin/models').set('Cookie', cookie);
  expect(r2.status).toBe(200);
});
