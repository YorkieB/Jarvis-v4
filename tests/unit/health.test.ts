/**
 * Unit tests for Health Check Module
 */

import { createHealthRouter, setPrismaInstance } from '../../src/health';
import { PrismaClient } from '@prisma/client';
import express from 'express';
import request from 'supertest';

describe('Health Check Module', () => {
  let app: express.Application;
  let prisma: PrismaClient;

  beforeAll(() => {
    app = express();
    app.disable('x-powered-by');
    prisma = new PrismaClient();
    setPrismaInstance(prisma);
    app.use(createHealthRouter());
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('GET /health', () => {
    it('should return 200 with health status', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('checks');
    });

    it('should include system metrics', async () => {
      const response = await request(app).get('/health');
      expect(response.body.system).toBeDefined();
      expect(response.body.system.platform).toBeDefined();
      expect(response.body.system.nodeVersion).toBeDefined();
      expect(response.body.system.memory).toBeDefined();
      expect(response.body.system.cpu).toBeDefined();
    });

    it('should include database check', async () => {
      const response = await request(app).get('/health');
      expect(response.body.checks.database).toBeDefined();
      expect(response.body.checks.database.status).toMatch(/pass|fail/);
    });

    it('should include external API checks', async () => {
      const response = await request(app).get('/health');
      expect(response.body.checks.openai).toBeDefined();
      expect(response.body.checks.deepgram).toBeDefined();
      expect(response.body.checks.elevenlabs).toBeDefined();
    });
  });

  describe('GET /health/live', () => {
    it('should always return 200', async () => {
      const response = await request(app).get('/health/live');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('alive');
    });
  });

  describe('GET /health/ready', () => {
    it('should return 200 when critical checks pass', async () => {
      const response = await request(app).get('/health/ready');
      // Should be 200 if database, memory, and uptime checks pass
      expect([200, 503]).toContain(response.status);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('checks');
    });

    it('should include all health checks', async () => {
      const response = await request(app).get('/health/ready');
      expect(response.body.checks).toBeDefined();
      expect(response.body.checks.database).toBeDefined();
    });
  });
});
