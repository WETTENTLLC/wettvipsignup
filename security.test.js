const request = require('supertest');
const app = require('./backend-example');

describe('Security headers', () => {
  test('returns CSP header via helmet', async () => {
    const response = await request(app).get('/api/admin/venues');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['permissions-policy']).toBe('geolocation=(), microphone=()');
    expect(response.headers['cross-origin-resource-policy']).toBe('same-origin');
  });
});
