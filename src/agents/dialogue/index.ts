import { BaseAgent } from '../base-agent';
import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';

export class DialogueAgent extends BaseAgent {
  protected agentType = 'dialogue';
  protected permissions = ['read:conversations', 'write:conversations'];

  private openai: OpenAI;
  private prisma: PrismaClient;
  // Keep in-memory cache for active conversations (performance optimization)
  private conversationHistory: Map<string, ChatCompletionMessageParam[]> =
    new Map();
  // Map sessionId to conversationId for quick lookup
  private sessionToConversation: Map<string, string> = new Map();

  constructor(prisma?: PrismaClient) {
    super();
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.prisma = prisma || new PrismaClient();
  }

  /**
   * Get or create conversation for user
   */
  private async getOrCreateConversation(
    userId: string,
    conversationId?: string,
  ): Promise<string> {
    if (conversationId) {
      // Verify conversation belongs to user
      const conversation = await this.prisma.conversation.findFirst({
        where: {
          id: conversationId,
          userId,
        },
      });

      if (conversation) {
        return conversationId;
      }
    }

    // Create new conversation
    const conversation = await this.prisma.conversation.create({
      data: {
        userId,
      },
    });

    return conversation.id;
  }

  /**
   * Load conversation history from database
   */
  private async loadConversationHistory(
    conversationId: string,
  ): Promise<ChatCompletionMessageParam[]> {
    try {
      const messages = await this.prisma.message.findMany({
        where: {
          conversationId,
        },
        orderBy: {
          timestamp: 'asc',
        },
      });

      return messages.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }));
    } catch (error) {
      logger.error('Failed to load conversation history', {
        conversationId,
        error,
      });
      return [];
    }
  }

  /**
   * Save message to database
   */
  private async saveMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
  ): Promise<void> {
    try {
      await this.prisma.message.create({
        data: {
          conversationId,
          role,
          content,
        },
      });

      // Update conversation updatedAt timestamp
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });
    } catch (error) {
      logger.error('Failed to save message', { conversationId, role, error });
      // Don't throw - allow conversation to continue even if DB write fails
    }
  }

  /**
   * Generate response with persistent memory
   */
  async generateResponse(
    input: string,
    sessionId: string,
    userId: string,
    conversationId?: string,
  ): Promise<string> {
    try {
      // Get or create conversation
      const convId =
        conversationId ||
        this.sessionToConversation.get(sessionId) ||
        (await this.getOrCreateConversation(userId, conversationId));

      // Store mapping for future use
      this.sessionToConversation.set(sessionId, convId);

      // Load conversation history (from cache or database)
      let history = this.conversationHistory.get(sessionId);
      if (!history) {
        history = await this.loadConversationHistory(convId);
        this.conversationHistory.set(sessionId, history);
      }

      // Add user message
      history.push({ role: 'user', content: input });

      // Save user message to database
      await this.saveMessage(convId, 'user', input);

      // RULE 2: Grounding in context (conversation history)
      await this.callLLM(input, {
        context: history,
      });

      // Call OpenAI with full context
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are Jarvis, a helpful AI assistant.',
          },
          ...history,
        ],
      });

      const assistantMessage = completion.choices[0].message.content!;

      // Update history
      history.push({ role: 'assistant', content: assistantMessage });
      this.conversationHistory.set(sessionId, history);

      // Save assistant message to database
      await this.saveMessage(convId, 'assistant', assistantMessage);

      return assistantMessage;
    } catch (error) {
      logger.error('Failed to generate response', {
        sessionId,
        userId,
        error,
      });
      throw error;
    }
  }

  /**
   * Create new conversation
   */
  async createConversation(
    userId: string,
    title?: string,
  ): Promise<string> {
    const conversation = await this.prisma.conversation.create({
      data: {
        userId,
      },
    });
    return conversation.id;
  }

  /**
   * List user's conversations
   */
  async listConversations(userId: string) {
    return await this.prisma.conversation.findMany({
      where: {
        userId,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      include: {
        messages: {
          take: 1,
          orderBy: {
            timestamp: 'desc',
          },
        },
      },
    });
  }

  /**
   * Get specific conversation
   */
  async getConversation(conversationId: string, userId: string) {
    return await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        userId,
      },
      include: {
        messages: {
          orderBy: {
            timestamp: 'asc',
          },
        },
      },
    });
  }

  /**
   * Delete conversation
   */
  async deleteConversation(conversationId: string, userId: string): Promise<void> {
    // Verify ownership
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        userId,
      },
    });

    if (!conversation) {
      throw new Error('Conversation not found or access denied');
    }

    // Delete messages first (cascade)
    await this.prisma.message.deleteMany({
      where: {
        conversationId,
      },
    });

    // Delete conversation
    await this.prisma.conversation.delete({
      where: {
        id: conversationId,
      },
    });
  }
}
