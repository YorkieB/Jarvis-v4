/**
 * Integration tests for Orchestrator
 */

import { Orchestrator } from '../../src/orchestrator';

describe('Orchestrator', () => {
  let orchestrator: Orchestrator;

  beforeEach(() => {
    orchestrator = new Orchestrator();
  });

  it('should route message to dialogue agent', async () => {
    const message = {
      type: 'conversation',
      content: 'Hello Jarvis',
      sessionId: 'test-session'
    };
    
    const response = await orchestrator.routeMessage(message);
    expect(response.agent).toBe('dialogue');
    expect(response.status).toBe('received');
  });

  it('should route search message to web agent', async () => {
    const message = {
      type: 'search',
      content: 'What is the weather today?',
      sessionId: 'test-session'
    };
    
    const response = await orchestrator.routeMessage(message);
    expect(response.agent).toBe('web');
    expect(response.status).toBe('received');
  });

  it('should route music message to spotify agent', async () => {
    const message = {
      type: 'music',
      content: 'Play some jazz',
      sessionId: 'test-session'
    };
    
    const response = await orchestrator.routeMessage(message);
    expect(response.agent).toBe('spotify');
    expect(response.status).toBe('received');
  });

  it('should default to dialogue agent for unknown message types', async () => {
    const message = {
      type: 'unknown',
      content: 'Random message',
      sessionId: 'test-session'
    };
    
    const response = await orchestrator.routeMessage(message);
    expect(response.agent).toBe('dialogue');
    expect(response.status).toBe('received');
  });
});
