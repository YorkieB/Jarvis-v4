/**
 * Integration tests for Orchestrator
 */

import { Orchestrator } from '../../src/orchestrator';

jest.mock('../../src/utils/prisma', () => ({
  prisma: {
    agent: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'agent-1' }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    task: {
      create: jest.fn().mockResolvedValue({ id: 'task-1' }),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
  },
}));

describe('Orchestrator', () => {
  let orchestrator: Orchestrator;

  beforeEach(() => {
    orchestrator = new Orchestrator();
  });

  it('should route message to dialogue agent', async () => {
    const message = {
      type: 'conversation',
      content: 'Hello Jarvis',
      sessionId: 'test-session',
    };

    const response = await orchestrator.routeMessage(message);
    expect(response.agent).toBe('dialogue');
    expect(response.status).toBe('received');
  });

  it('should route search message to web agent', async () => {
    const message = {
      type: 'search',
      content: 'What is the weather today?',
      sessionId: 'test-session',
    };

    const response = await orchestrator.routeMessage(message);
    expect(response.agent).toBe('web');
    expect(response.status).toBe('received');
  });

  it('should route music message to spotify agent', async () => {
    const message = {
      type: 'music',
      content: 'Play some jazz',
      sessionId: 'test-session',
    };

    const response = await orchestrator.routeMessage(message);
    expect(response.agent).toBe('spotify');
    expect(response.status).toBe('received');
  });

  it('should default to dialogue agent for unknown message types', async () => {
    const message = {
      type: 'unknown',
      content: 'Random message',
      sessionId: 'test-session',
    };

    const response = await orchestrator.routeMessage(message);
    expect(response.agent).toBe('dialogue');
    expect(response.status).toBe('received');
  });
});
