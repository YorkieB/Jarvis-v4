import { BaseAgent } from '../base-agent';
import pm2 from 'pm2';
import logger from '../../utils/logger';

interface AgentHealthStatus {
  consecutiveFailures: number;
  lastFailureTime: number;
  lastRestartTime: number;
  restartCount: number;
  isCircuitOpen: boolean;
  healthScore: number; // 0-100
}

interface CircuitBreakerConfig {
  failureThreshold: number; // Open circuit after N consecutive failures
  resetTimeout: number; // Milliseconds before attempting reset
  maxRestarts: number; // Maximum restarts before giving up
  backoffMultiplier: number; // Exponential backoff multiplier
}

export class SelfHealingAgent extends BaseAgent {
  protected agentType = 'self-healing';
  protected permissions = ['read:agent_health', 'write:agent_health'];

  private healthStatus: Map<string, AgentHealthStatus> = new Map();
  private readonly config: CircuitBreakerConfig = {
    failureThreshold: 3, // Open circuit after 3 failures
    resetTimeout: 60000, // 1 minute before retry
    maxRestarts: 5, // Max 5 restarts per hour
    backoffMultiplier: 2, // Double wait time each failure
  };
  private readonly monitoringInterval = 30000; // 30 seconds
  private pm2Connected = false;
  private selfMonitoringInterval: NodeJS.Timeout | null = null;
  private lastSelfHeartbeat: number = Date.now();

  async startMonitoring(): Promise<void> {
    // Connect to PM2
    return new Promise((resolve, reject) => {
      pm2.connect((err) => {
        if (err) {
          logger.error('Failed to connect to PM2', { error: err });
          reject(err);
          return;
        }

        this.pm2Connected = true;
        logger.info('Self-Healing Agent connected to PM2');

        // Start monitoring loop
        setInterval(() => {
          void this.checkAllAgents();
        }, this.monitoringInterval);

        // Also check health endpoints periodically
        setInterval(() => {
          void this.checkHealthEndpoints();
        }, this.monitoringInterval * 2); // Check every 60 seconds

        // Start self-monitoring
        this.startSelfMonitoring();

        logger.info(
          `Self-Healing Agent monitoring started (interval: ${this.monitoringInterval}ms)`,
        );
        resolve();
      });
    });
  }

  private async checkAllAgents(): Promise<void> {
    if (!this.pm2Connected) {
      logger.warn('PM2 not connected, skipping agent check');
      return;
    }

    pm2.list((err, processes) => {
      if (err) {
        logger.error('Failed to list PM2 processes', { error: err });
        return;
      }

      for (const proc of processes) {
        if (!proc.name) continue;

        const status = proc.pm2_env?.status;
        if (status === 'stopped' || status === 'errored') {
          void this.handleAgentFailure(proc.name, status);
        } else if (status === 'online') {
          // Reset failure count on success
          this.recordAgentSuccess(proc.name);
        }
      }
    });
  }

  private async checkHealthEndpoints(): Promise<void> {
    // Check main server health endpoint
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    try {
      const response = await fetch(`${baseUrl}/health`, {
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      if (!response.ok) {
        logger.warn('Health endpoint returned non-OK status', {
          status: response.status,
        });
        // Could trigger server restart if health fails repeatedly
      }
    } catch (error) {
      logger.error('Health endpoint check failed', { error });
      // Health endpoint failure is critical - could indicate server crash
    }
  }

  private async handleAgentFailure(
    agentName: string,
    status: string,
  ): Promise<void> {
    const health = this.getOrCreateHealthStatus(agentName);

    // Check circuit breaker
    if (health.isCircuitOpen) {
      const timeSinceLastFailure = Date.now() - health.lastFailureTime;
      if (timeSinceLastFailure < this.config.resetTimeout) {
        logger.debug(
          `Circuit breaker open for ${agentName}, waiting before retry`,
        );
        return;
      } else {
        // Reset circuit breaker
        health.isCircuitOpen = false;
        health.consecutiveFailures = 0;
        logger.info(`Circuit breaker reset for ${agentName}`);
      }
    }

    // Check max restart limit
    const timeSinceLastRestart = Date.now() - health.lastRestartTime;
    const oneHour = 60 * 60 * 1000;
    if (timeSinceLastRestart < oneHour && health.restartCount >= this.config.maxRestarts) {
      logger.error(
        `Max restart limit reached for ${agentName}. Manual intervention required.`,
      );
      health.isCircuitOpen = true;
      health.healthScore = 0;
      return;
    }

    // Increment failure count
    health.consecutiveFailures++;
    health.lastFailureTime = Date.now();
    health.healthScore = Math.max(0, health.healthScore - 20);

    logger.warn(`Agent ${agentName} is ${status}`, {
      consecutiveFailures: health.consecutiveFailures,
      restartCount: health.restartCount,
    });

    // Open circuit breaker if threshold reached
    if (health.consecutiveFailures >= this.config.failureThreshold) {
      health.isCircuitOpen = true;
      logger.error(
        `Circuit breaker opened for ${agentName} after ${health.consecutiveFailures} failures`,
      );
    }

    // Attempt restart with exponential backoff
    const backoffDelay =
      Math.pow(this.config.backoffMultiplier, health.consecutiveFailures - 1) *
      1000; // Start with 1 second

    setTimeout(() => {
      void this.restartAgent(agentName);
    }, Math.min(backoffDelay, 30000)); // Cap at 30 seconds
  }

  private async restartAgent(agentName: string): Promise<void> {
    const health = this.getOrCreateHealthStatus(agentName);

    // Reset restart count if more than an hour has passed
    const timeSinceLastRestart = Date.now() - health.lastRestartTime;
    const oneHour = 60 * 60 * 1000;
    if (timeSinceLastRestart > oneHour) {
      health.restartCount = 0;
    }

    health.restartCount++;
    health.lastRestartTime = Date.now();

    return new Promise((resolve) => {
      pm2.restart(agentName, (err) => {
        if (err) {
          logger.error(`Failed to restart ${agentName}`, {
            error: err,
            restartCount: health.restartCount,
          });
          health.healthScore = Math.max(0, health.healthScore - 10);
        } else {
          logger.info(`✅ ${agentName} restarted successfully`, {
            restartCount: health.restartCount,
          });
          health.healthScore = Math.min(100, health.healthScore + 30);
          // Reset consecutive failures on successful restart
          health.consecutiveFailures = 0;
        }
        resolve();
      });
    });
  }

  private recordAgentSuccess(agentName: string): void {
    const health = this.getOrCreateHealthStatus(agentName);
    // Reset failure count on success
    if (health.consecutiveFailures > 0) {
      health.consecutiveFailures = 0;
      health.healthScore = Math.min(100, health.healthScore + 5);
      logger.debug(`Agent ${agentName} recovered, resetting failure count`);
    }
  }

  private getOrCreateHealthStatus(agentName: string): AgentHealthStatus {
    if (!this.healthStatus.has(agentName)) {
      this.healthStatus.set(agentName, {
        consecutiveFailures: 0,
        lastFailureTime: 0,
        lastRestartTime: 0,
        restartCount: 0,
        isCircuitOpen: false,
        healthScore: 100,
      });
    }
    return this.healthStatus.get(agentName)!;
  }

  /**
   * Get health status for all agents (for monitoring/API)
   */
  getHealthStatus(): Map<string, AgentHealthStatus> {
    return new Map(this.healthStatus);
  }

  /**
   * Start self-monitoring to detect if self-healing agent itself fails
   */
  private startSelfMonitoring(): void {
    this.lastSelfHeartbeat = Date.now();

    this.selfMonitoringInterval = setInterval(() => {
      const timeSinceHeartbeat = Date.now() - this.lastSelfHeartbeat;
      const maxInterval = this.monitoringInterval * 3; // 90 seconds

      if (timeSinceHeartbeat > maxInterval) {
        logger.error('🚨 CRITICAL: Self-healing agent self-monitoring detected potential failure', {
          timeSinceHeartbeat,
          maxInterval,
        });

        // Attempt self-recovery
        void this.attemptSelfRecovery();
      } else {
        // Update heartbeat
        this.lastSelfHeartbeat = Date.now();
      }
    }, this.monitoringInterval);
  }

  /**
   * Attempt self-recovery
   */
  private async attemptSelfRecovery(): Promise<void> {
    try {
      logger.warn('Attempting self-recovery for self-healing agent');

      // Try to restart via PM2
      if (this.pm2Connected) {
        return new Promise((resolve) => {
          pm2.restart('self-healing-agent', (err) => {
            if (err) {
              logger.error('Failed to restart self-healing agent', { error: err });
            } else {
              logger.info('Self-healing agent restarted successfully');
            }
            resolve();
          });
        });
      } else {
        logger.error('PM2 not connected, cannot self-restart');
      }
    } catch (error) {
      logger.error('Self-recovery attempt failed', { error });
    }
  }

  /**
   * Update self-heartbeat (called by external watchdog)
   */
  updateHeartbeat(): void {
    this.lastSelfHeartbeat = Date.now();
  }

  /**
   * Get self-monitoring status
   */
  getSelfMonitoringStatus() {
    return {
      lastHeartbeat: this.lastSelfHeartbeat,
      timeSinceHeartbeat: Date.now() - this.lastSelfHeartbeat,
      pm2Connected: this.pm2Connected,
    };
  }
}
