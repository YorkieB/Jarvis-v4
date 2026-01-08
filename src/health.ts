/**
 * Health Check Module
 * Provides health check endpoints for monitoring and deployment verification
 */

import { Application, Request, Response, Router } from 'express';
import os from 'os';

interface HealthCheck {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  system: {
    platform: string;
    nodeVersion: string;
    memory: {
      total: number;
      free: number;
      used: number;
      usagePercent: number;
    };
    cpu: {
      cores: number;
      loadAverage: number[];
    };
  };
  checks: {
    [key: string]: {
      status: 'pass' | 'fail';
      message?: string;
    };
  };
}

/**
 * Perform basic system health checks
 */
function performHealthChecks(): HealthCheck['checks'] {
  const checks: HealthCheck['checks'] = {};

  // Check memory usage
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memUsagePercent = (usedMem / totalMem) * 100;

  checks.memory = {
    status: memUsagePercent < 90 ? 'pass' : 'fail',
    message:
      memUsagePercent < 90
        ? 'Memory usage within acceptable range'
        : 'Memory usage critical',
  };

  // Check process uptime
  const uptime = process.uptime();
  checks.uptime = {
    status: uptime > 0 ? 'pass' : 'fail',
    message: `Process has been running for ${Math.floor(uptime)} seconds`,
  };

  // Check if required environment variables are set
  const requiredEnvVars = ['NODE_ENV'];
  const missingEnvVars = requiredEnvVars.filter((v) => !process.env[v]);

  checks.environment = {
    status: missingEnvVars.length === 0 ? 'pass' : 'fail',
    message:
      missingEnvVars.length === 0
        ? 'All required environment variables are set'
        : `Missing environment variables: ${missingEnvVars.join(', ')}`,
  };

  return checks;
}

/**
 * Create health check router
 */
export function createHealthRouter(): Router {
  const router = Router();

  /**
   * Basic health check endpoint
   * Returns 200 if service is running
   */
  router.get('/health', (req: Request, res: Response) => {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    const checks = performHealthChecks();
    const allChecksPassed = Object.values(checks).every(
      (check) => check.status === 'pass',
    );

    const healthData: HealthCheck = {
      status: allChecksPassed ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '4.0.0',
      environment: process.env.NODE_ENV || 'development',
      system: {
        platform: os.platform(),
        nodeVersion: process.version,
        memory: {
          total: totalMem,
          free: freeMem,
          used: usedMem,
          usagePercent: (usedMem / totalMem) * 100,
        },
        cpu: {
          cores: os.cpus().length,
          loadAverage: os.loadavg(),
        },
      },
      checks,
    };

    const statusCode = allChecksPassed ? 200 : 503;
    res.status(statusCode).json(healthData);
  });

  /**
   * Liveness probe - minimal check to verify process is running
   * Used by orchestrators for basic alive check
   */
  router.get('/health/live', (req: Request, res: Response) => {
    res.status(200).json({
      status: 'alive',
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * Readiness probe - check if service is ready to accept traffic
   * Used during deployments and load balancer health checks
   */
  router.get('/health/ready', (req: Request, res: Response) => {
    const checks = performHealthChecks();
    const allChecksPassed = Object.values(checks).every(
      (check) => check.status === 'pass',
    );

    if (allChecksPassed) {
      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString(),
        checks,
      });
    } else {
      res.status(503).json({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        checks,
      });
    }
  });

  return router;
}

/**
 * Simple middleware to add health check to existing Express app
 */
export function addHealthCheck(app: Application): void {
  const healthRouter = createHealthRouter();
  app.use(healthRouter);
}
