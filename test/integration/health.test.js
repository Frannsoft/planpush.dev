import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getApp } from '../helpers/app.js';
import { resetDb } from '../helpers/db.js';
import { knex } from '../../src/db.js';

describe('Health Check', () => {
  let app;

  beforeAll(async () => {
    app = await getApp();
  });

  afterAll(async () => {
    await knex.destroy();
  });

  beforeEach(async () => {
    // Reset database before each test
    await resetDb();
  });

  it('GET /health returns 200 with ok status', async () => {
    const res = await request(app)
      .get('/health')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('timestamp');
    expect(new Date(res.body.timestamp)).toBeInstanceOf(Date);
  });
});
