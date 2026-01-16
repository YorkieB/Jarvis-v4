/**
 * Audit Logger
 * Immutable audit trail for all agent actions
 */

import logger from '../utils/logger';
import { prisma as globalPrisma } from '../utils/prisma';

type JsonInput =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonInput }
  | JsonInput[];

interface AuditLogEntry {
  timestamp: Date;
  agent_id?: string;
  user_id?: string;
  action: string;
  input?: unknown;
  output?: unknown;
  status: 'success' | 'failed' | 'pending';
  error?: string;
  metadata?: Record<string, unknown>;
}

type PrismaClient = typeof globalPrisma;

export class AuditLogger {
  private readonly prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || globalPrisma;
  }

  private async persist(entry: AuditLogEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        timestamp: entry.timestamp,
        agentId: entry.agent_id,
        userId: entry.user_id,
        action: entry.action,
        input: entry.input as JsonInput | undefined,
        output: entry.output as JsonInput | undefined,
        status: entry.status,
        error: entry.error,
        metadata: entry.metadata as JsonInput | undefined,
      },
    });
  }

  /**
   * Log a decision made by an AI agent
   */
  async logDecision(entry: {
    agentId: string;
    userId?: string;
    input: string;
    output: string;
    confidence: number;
    sources: unknown[];
  }): Promise<void> {
    const logEntry: AuditLogEntry = {
      timestamp: new Date(),
      agent_id: entry.agentId,
      user_id: entry.userId,
      action: 'decision',
      input: entry.input,
      output: entry.output,
      status: 'success',
      metadata: {
        confidence: entry.confidence,
        sources: entry.sources,
      },
    };

    await this.persist(logEntry);
    logger.info('[AUDIT]', logEntry);
  }

  /**
   * Log a tool call
   */
  async logToolCall(entry: {
    agentId: string;
    userId?: string;
    toolName: string;
    inputs: unknown;
    outputs: unknown;
    status: 'success' | 'failed';
    error?: string;
  }): Promise<void> {
    const logEntry: AuditLogEntry = {
      timestamp: new Date(),
      agent_id: entry.agentId,
      user_id: entry.userId,
      action: 'tool_call',
      input: {
        tool: entry.toolName,
        ...(typeof entry.inputs === 'object' && entry.inputs !== null
          ? (entry.inputs as Record<string, unknown>)
          : { inputs: entry.inputs }),
      },
      output: entry.outputs,
      status: entry.status,
      error: entry.error,
    };

    await this.persist(logEntry);
    logger.info('[AUDIT]', logEntry);
  }

  /**
   * Log a rule violation
   */
  async logRuleViolation(entry: {
    agentId: string;
    userId?: string;
    rule: string;
    context: unknown;
  }): Promise<void> {
    const logEntry: AuditLogEntry = {
      timestamp: new Date(),
      agent_id: entry.agentId,
      user_id: entry.userId,
      action: 'rule_violation',
      status: 'failed',
      metadata: {
        rule: entry.rule,
        context: entry.context,
        severity: 'critical',
      },
    };

    await this.persist(logEntry);
    logger.error('[AUDIT] RULE VIOLATION:', logEntry);
  }
}

export const auditLogger = new AuditLogger();
