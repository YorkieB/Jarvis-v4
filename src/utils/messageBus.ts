/**
 * Message Bus for Inter-Agent Communication
 * Simple event emitter-based message bus
 */

import { EventEmitter } from 'events';

export interface AgentMessage {
  from: string;
  to?: string; // undefined = broadcast
  type: string;
  payload: Record<string, unknown>;
  timestamp: Date;
  messageId: string;
}

export class MessageBus extends EventEmitter {
  private static instance: MessageBus;

  private constructor() {
    super();
  }

  static getInstance(): MessageBus {
    if (!MessageBus.instance) {
      MessageBus.instance = new MessageBus();
    }
    return MessageBus.instance;
  }

  /**
   * Send a message to a specific agent
   */
  sendMessage(message: Omit<AgentMessage, 'timestamp' | 'messageId'>): void {
    const fullMessage: AgentMessage = {
      ...message,
      timestamp: new Date(),
      messageId: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };

    if (message.to) {
      // Direct message
      this.emit(`agent:${message.to}`, fullMessage);
    } else {
      // Broadcast
      this.emit('broadcast', fullMessage);
    }

    // Also emit by type for type-based subscriptions
    this.emit(`type:${message.type}`, fullMessage);
  }

  /**
   * Subscribe to messages for a specific agent
   */
  subscribeToAgent(
    agentId: string,
    handler: (message: AgentMessage) => void,
  ): void {
    this.on(`agent:${agentId}`, handler);
  }

  /**
   * Subscribe to broadcast messages
   */
  subscribeToBroadcast(handler: (message: AgentMessage) => void): void {
    this.on('broadcast', handler);
  }

  /**
   * Subscribe to messages by type
   */
  subscribeToType(
    messageType: string,
    handler: (message: AgentMessage) => void,
  ): void {
    this.on(`type:${messageType}`, handler);
  }

  /**
   * Unsubscribe from messages
   */
  unsubscribe(
    agentId?: string,
    handler?: (message: AgentMessage) => void,
  ): void {
    if (agentId && handler) {
      this.off(`agent:${agentId}`, handler);
    } else if (agentId) {
      this.removeAllListeners(`agent:${agentId}`);
    }
  }
}
