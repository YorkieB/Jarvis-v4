/**
 * Unit tests for Self-Healing Agent
 */

import { SelfHealingAgent } from '../../src/agents/self-healing';

describe('Self-Healing Agent', () => {
  let agent: SelfHealingAgent;

  beforeEach(() => {
    agent = new SelfHealingAgent();
  });

  describe('Initialization', () => {
    it('should create agent instance', () => {
      expect(agent).toBeInstanceOf(SelfHealingAgent);
    });

    it('should have correct agent type', () => {
      expect((agent as any).agentType).toBe('self-healing');
    });

    it('should have correct permissions', () => {
      const permissions = (agent as any).permissions;
      expect(permissions).toContain('read:agent_health');
      expect(permissions).toContain('write:agent_health');
    });
  });

  describe('Health Status Tracking', () => {
    it('should track health status for agents', () => {
      const healthStatus = agent.getHealthStatus();
      expect(healthStatus).toBeInstanceOf(Map);
    });

    it('should initialize health status on first access', () => {
      // Access internal method through any cast for testing
      const health = (agent as any).getOrCreateHealthStatus('test-agent');
      expect(health).toBeDefined();
      expect(health.consecutiveFailures).toBe(0);
      expect(health.restartCount).toBe(0);
      expect(health.healthScore).toBe(100);
      expect(health.isCircuitOpen).toBe(false);
    });
  });

  describe('Circuit Breaker Logic', () => {
    it('should track consecutive failures', () => {
      const agentName = 'test-agent';
      // Simulate failures
      void (agent as any).handleAgentFailure(agentName, 'errored');
      void (agent as any).handleAgentFailure(agentName, 'errored');
      void (agent as any).handleAgentFailure(agentName, 'errored');

      const health = (agent as any).getOrCreateHealthStatus(agentName);
      expect(health.consecutiveFailures).toBeGreaterThan(0);
    });

    it('should open circuit breaker after threshold', () => {
      const agentName = 'test-agent';
      const config = (agent as any).config;
      const threshold = config.failureThreshold;

      // Simulate failures up to threshold
      for (let i = 0; i < threshold; i++) {
        void (agent as any).handleAgentFailure(agentName, 'errored');
      }

      const health = (agent as any).getOrCreateHealthStatus(agentName);
      expect(health.isCircuitOpen).toBe(true);
    });
  });

  describe('Health Score', () => {
    it('should decrease health score on failures', () => {
      const agentName = 'test-agent';
      const initialHealth = (agent as any).getOrCreateHealthStatus(agentName);
      expect(initialHealth.healthScore).toBe(100);

      void (agent as any).handleAgentFailure(agentName, 'errored');
      const healthAfterFailure = (agent as any).getOrCreateHealthStatus(
        agentName,
      );
      expect(healthAfterFailure.healthScore).toBeLessThan(100);
    });

    it('should increase health score on success', () => {
      const agentName = 'test-agent';
      // First cause a failure to lower score
      void (agent as any).handleAgentFailure(agentName, 'errored');
      const healthAfterFailure = (agent as any).getOrCreateHealthStatus(
        agentName,
      );
      const scoreAfterFailure = healthAfterFailure.healthScore;

      // Then record success
      (agent as any).recordAgentSuccess(agentName);
      const healthAfterSuccess = (agent as any).getOrCreateHealthStatus(
        agentName,
      );
      expect(healthAfterSuccess.healthScore).toBeGreaterThan(scoreAfterFailure);
    });
  });
});
