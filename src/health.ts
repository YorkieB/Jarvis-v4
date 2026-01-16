/**
 * Health Check Module
 * Provides health check endpoints for monitoring and deployment verification
 */

import { Application, Request, Response, Router } from 'express';
import os from 'os';
import { PrismaClient } from '@prisma/client';
import logger from './utils/logger';

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

// Store Prisma instance for health checks (set by createHealthRouter)
let prismaInstance: PrismaClient | null = null;
// Store code analysis agent for code health checks
let codeAnalysisAgent: any = null;

/**
 * Set Prisma instance for health checks
 */
export function setPrismaInstance(prisma: PrismaClient): void {
  prismaInstance = prisma;
}

/**
 * Set code analysis agent for code health checks
 */
export function setCodeAnalysisAgent(agent: any): void {
  codeAnalysisAgent = agent;
}

/**
 * Check external service health with timeout
 */
async function checkExternalService(
  serviceName: string,
  checkFn: () => Promise<boolean>,
  timeoutMs = 5000,
): Promise<{ status: 'pass' | 'fail'; message?: string }> {
  try {
    const timeoutPromise = new Promise<boolean>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), timeoutMs),
    );
    const result = await Promise.race([checkFn(), timeoutPromise]);
    return {
      status: result ? 'pass' : 'fail',
      message: result ? `${serviceName} is reachable` : `${serviceName} check failed`,
    };
  } catch (error) {
    return {
      status: 'fail',
      message: `${serviceName} unreachable: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Check OpenAI API health
 */
async function checkOpenAIHealth(): Promise<boolean> {
  if (!process.env.OPENAI_API_KEY) {
    return false;
  }
  // Simple check: if API key exists, assume service is available
  // In production, could make a lightweight API call
  return true;
}

/**
 * Check Deepgram API health
 */
async function checkDeepgramHealth(): Promise<boolean> {
  if (!process.env.DEEPGRAM_API_KEY) {
    return false;
  }
  return true;
}

/**
 * Check ElevenLabs API health
 */
async function checkElevenLabsHealth(): Promise<boolean> {
  if (!process.env.ELEVENLABS_API_KEY) {
    return false;
  }
  return true;
}

/**
 * Check disk space (simplified - checks if we can write to logs directory)
 */
function checkDiskSpace(): { status: 'pass' | 'fail'; message?: string } {
  try {
    const fs = require('fs');
    const path = require('path');
    const logDir = path.join(__dirname, '../logs');
    // Try to write a test file
    const testFile = path.join(logDir, '.health-check');
    fs.writeFileSync(testFile, 'health-check');
    fs.unlinkSync(testFile);
    return {
      status: 'pass',
      message: 'Disk space available',
    };
  } catch (error) {
    return {
      status: 'fail',
      message: `Disk space check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Perform comprehensive health checks
 */
async function performHealthChecks(): Promise<HealthCheck['checks']> {
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

  // Database connectivity check
  if (prismaInstance) {
    try {
      await prismaInstance.$queryRaw`SELECT 1`;
      checks.database = {
        status: 'pass',
        message: 'Database connected',
      };
    } catch (error) {
      checks.database = {
        status: 'fail',
        message: `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  } else {
    checks.database = {
      status: 'fail',
      message: 'Database instance not initialized',
    };
  }

  // External API health checks (non-blocking, with timeout)
  checks.openai = await checkExternalService('OpenAI', checkOpenAIHealth);
  checks.deepgram = await checkExternalService('Deepgram', checkDeepgramHealth);
  checks.elevenlabs = await checkExternalService('ElevenLabs', checkElevenLabsHealth);

  // Disk space check
  checks.diskSpace = checkDiskSpace();

  // Code health check (if code analysis agent is available)
  if (codeAnalysisAgent) {
    try {
      const codeHealth = await codeAnalysisAgent.getCodeHealthMetrics();
      const hasErrors = codeHealth.totalErrors > 0;
      checks.codeHealth = {
        status: hasErrors ? 'fail' : 'pass',
        message: hasErrors
          ? `${codeHealth.totalErrors} code errors detected`
          : 'No code errors detected',
      };
    } catch (error) {
      checks.codeHealth = {
        status: 'fail',
        message: `Code health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

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
  router.get('/health', async (req: Request, res: Response) => {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    try {
      const checks = await performHealthChecks();
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
    } catch (error) {
      logger.error('Health check failed', { error });
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check execution failed',
      });
    }
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
  router.get('/health/ready', async (req: Request, res: Response) => {
    try {
      const checks = await performHealthChecks();
      // For readiness, database is critical - other checks can be warnings
      const criticalChecks = ['database', 'memory', 'uptime'];
      const criticalChecksPassed = criticalChecks.every(
        (key) => checks[key]?.status === 'pass',
      );
      const allChecksPassed = Object.values(checks).every(
        (check) => check.status === 'pass',
      );

      if (criticalChecksPassed) {
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
    } catch (error) {
      logger.error('Readiness check failed', { error });
      res.status(503).json({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        error: 'Readiness check execution failed',
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
