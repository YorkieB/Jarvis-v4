/**
 * Audit Logger
 * Immutable audit trail for all agent actions
 */

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

export class AuditLogger {
  /**
   * Log a decision made by an AI agent
   */
  async logDecision(entry: {
    agentId: string;
    input: string;
    output: string;
    confidence: number;
    sources: unknown[];
  }): Promise<void> {
    const logEntry: AuditLogEntry = {
      timestamp: new Date(),
      agent_id: entry.agentId,
      action: 'decision',
      input: entry.input,
      output: entry.output,
      status: 'success',
      metadata: {
        confidence: entry.confidence,
        sources: entry.sources,
      },
    };

    // TODO: Store in database
    console.log('[AUDIT]', logEntry);
  }

  /**
   * Log a tool call
   */
  async logToolCall(entry: {
    agentId: string;
    toolName: string;
    inputs: Record<string, unknown>;
    outputs: unknown;
    status: 'success' | 'failed';
    error?: string;
  }): Promise<void> {
    const logEntry: AuditLogEntry = {
      timestamp: new Date(),
      agent_id: entry.agentId,
      action: 'tool_call',
      input: { tool: entry.toolName, ...entry.inputs },
      output: entry.outputs,
      status: entry.status,
      error: entry.error,
    };

    // TODO: Store in database
    console.log('[AUDIT]', logEntry);
  }

  /**
   * Log a rule violation
   */
  async logRuleViolation(entry: {
    agentId: string;
    rule: string;
    context: Record<string, unknown>;
  }): Promise<void> {
    const logEntry: AuditLogEntry = {
      timestamp: new Date(),
      agent_id: entry.agentId,
      action: 'rule_violation',
      status: 'failed',
      metadata: {
        rule: entry.rule,
        context: entry.context,
        severity: 'critical',
      },
    };

    // TODO: Store in database and alert admin
    console.error('[AUDIT] RULE VIOLATION:', logEntry);
  }
}

export const auditLogger = new AuditLogger();
