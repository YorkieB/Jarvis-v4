/**
 * Agent Communication Service
 * Handles inter-agent messaging and coordination
 */

import { MessageBus, AgentMessage } from '../utils/messageBus';
import logger from '../utils/logger';

export class AgentCommunicationService {
  private messageBus: MessageBus;
  private agentSubscriptions: Map<string, (message: AgentMessage) => void> =
    new Map();

  constructor() {
    this.messageBus = MessageBus.getInstance();
  }

  /**
   * Send a message to another agent
   */
  sendMessage(
    from: string,
    to: string,
    type: string,
    payload: Record<string, unknown>,
  ): void {
    this.messageBus.sendMessage({ from, to, type, payload });
    logger.debug('Message sent', { from, to, type });
  }

  /**
   * Broadcast a message to all agents
   */
  broadcastMessage(
    from: string,
    type: string,
    payload: Record<string, unknown>,
  ): void {
    this.messageBus.sendMessage({ from, type, payload });
    logger.debug('Message broadcast', { from, type });
  }

  /**
   * Subscribe to messages for this agent
   */
  subscribe(
    agentId: string,
    handler: (message: AgentMessage) => void,
  ): void {
    // Remove existing subscription if any
    const existingHandler = this.agentSubscriptions.get(agentId);
    if (existingHandler) {
      this.messageBus.unsubscribe(agentId, existingHandler);
    }

    // Add new subscription
    this.messageBus.subscribeToAgent(agentId, handler);
    this.agentSubscriptions.set(agentId, handler);
    logger.debug('Agent subscribed to messages', { agentId });
  }

  /**
   * Subscribe to messages by type
   */
  subscribeToType(
    messageType: string,
    handler: (message: AgentMessage) => void,
  ): void {
    this.messageBus.subscribeToType(messageType, handler);
    logger.debug('Subscribed to message type', { messageType });
  }

  /**
   * Unsubscribe agent from messages
   */
  unsubscribe(agentId: string): void {
    const handler = this.agentSubscriptions.get(agentId);
    if (handler) {
      this.messageBus.unsubscribe(agentId, handler);
      this.agentSubscriptions.delete(agentId);
      logger.debug('Agent unsubscribed', { agentId });
    }
  }

  /**
   * Request-response pattern: send message and wait for response
   */
  async requestResponse(
    from: string,
    to: string,
    type: string,
    payload: Record<string, unknown>,
    timeoutMs: number = 5000,
  ): Promise<AgentMessage | null> {
    return new Promise((resolve) => {
      const responseType = `${type}:response`;
      let responseHandler: ((message: AgentMessage) => void) | null = null;
      let timeout: NodeJS.Timeout | null = null;

      responseHandler = (message: AgentMessage) => {
        if (message.from === to && message.type === responseType) {
          if (timeout) clearTimeout(timeout);
          this.messageBus.unsubscribe(undefined, responseHandler!);
          resolve(message);
        }
      };

      this.messageBus.subscribeToType(responseType, responseHandler);

      // Send request
      this.sendMessage(from, to, type, payload);

      // Set timeout
      timeout = setTimeout(() => {
        this.messageBus.unsubscribe(undefined, responseHandler!);
        resolve(null);
      }, timeoutMs);
    });
  }
}
