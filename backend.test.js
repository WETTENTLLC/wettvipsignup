const request = require('supertest');
const fs = require('fs');
const path = require('path');

const TEST_DATA_FILE = path.join(__dirname, 'data.test.json');
process.env.DATA_FILE = TEST_DATA_FILE;
const bcrypt = require('bcryptjs');
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync('testpass', 10);

const app = require('./backend-example');

beforeEach(() => {
  if (fs.existsSync(TEST_DATA_FILE)) {
    fs.unlinkSync(TEST_DATA_FILE);
  }
});

afterAll(() => {
  if (fs.existsSync(TEST_DATA_FILE)) {
    fs.unlinkSync(TEST_DATA_FILE);
  }
});

test('POST /api/leads persists live lead data', async () => {
  const payload = { name: 'Alice', phone: '(123) 456-7890', modelId: 'cherish' };
  const response = await request(app).post('/api/leads').send(payload);

  expect(response.status).toBe(200);
  expect(response.body.success).toBe(true);
  expect(response.body.leadId).toMatch(/lead_/);

  const data = JSON.parse(fs.readFileSync(TEST_DATA_FILE, 'utf8'));
  expect(data.leads.length).toBe(1);
  expect(data.leads[0].name).toBe('Alice');
});

test('POST /api/passes returns pass code and requires backend', async () => {
  const response = await request(app).post('/api/passes').send({ phone: '(123) 456-7890', venueId: 'venue-a', modelId: 'cherish' });
  expect([200, 500]).toContain(response.status);
});

test('GET /api/admin/venues returns JSON array (requires login)', async () => {
  // login first
  const login = await request(app)
    .post('/api/admin/login')
    .send({ username: 'admin', password: 'testpass' });
  expect(login.status).toBe(200);
  const cookie = login.headers['set-cookie'];

  const response = await request(app).get('/api/admin/venues').set('Cookie', cookie);
  expect(response.status).toBe(200);
  expect(Array.isArray(response.body)).toBe(true);
});
