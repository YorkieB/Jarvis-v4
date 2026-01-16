/**
 * Base Agent Class
 *
 * ALL agents MUST extend this class
 * Enforces AI_RULES_MANDATORY.md compliance
 */

import OpenAI from 'openai';
import { AIRulesEnforcer } from '../governance/rules-enforcer';
import { auditLogger } from '../governance/audit-logger';

export interface TaskPayload {
  [key: string]: unknown;
}

export interface TaskResult {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface DelegatedTask {
  id: string;
  type: string;
  payload: TaskPayload;
  priority: 'low' | 'medium' | 'high' | 'critical';
  timeoutMs?: number;
}

export interface ChildAgent {
  id: string;
  agentType: string;
  capabilities: string[];
  status: 'idle' | 'busy' | 'error';
  currentWorkload: number;
}

export abstract class BaseAgent {
  protected abstract agentType: string;
  protected abstract permissions: string[];
  protected parentId?: string;
  protected children: Map<string, ChildAgent> = new Map();
  protected currentWorkload: number = 0;
  protected maxConcurrentTasks: number = 5;
  private static openaiClient: OpenAI | null = null;

  constructor() {
    this.acknowledgeRules();
  }

  /**
   * Acknowledge that this agent has read AI_RULES_MANDATORY.md
   */
  private acknowledgeRules(): void {
    console.log(`📋 ${this.agentType} Agent reading AI_RULES_MANDATORY.md...`);
    AIRulesEnforcer.acknowledgeRules(this.agentType);
    console.log(`✅ ${this.agentType} Agent acknowledged mandatory AI rules`);
  }

  /**
   * RULE 1 & 2: No guessing, must be grounded
   * All LLM calls MUST go through this method
   */
  protected async callLLM(
    prompt: string,
    options: { context?: unknown[]; confidence?: number } = {},
  ): Promise<{
    type: string;
    message: string;
    confidence: number;
    note?: string;
  }> {
    // Check rules acknowledged
    await AIRulesEnforcer.checkRulesAcknowledgment(this.agentType);

    // RULE 2: Must have context (grounding)
    if (!options.context) {
      throw new Error(
        `${this.agentType}: AI_RULES_MANDATORY.md violation - ` +
          `LLM calls must be grounded in context. Read files first.`,
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required for LLM calls');
    }

    // Lazy-init shared OpenAI client
    BaseAgent.openaiClient ??= new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const minConfidence = options.confidence ?? 0.9;

    const contextText = JSON.stringify(options.context, null, 2);

    const completion = await BaseAgent.openaiClient.chat.completions.create({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are a cautious assistant. Use ONLY the provided context. ' +
            'If context is insufficient, say "I do not know" and set confidence below 0.5. ' +
            'Respond as a JSON object with fields: answer (string), confidence (0-1), note (string, optional).',
        },
        {
          role: 'user',
          content: `Context:\n${contextText}\n\nPrompt:\n${prompt}`,
        },
      ],
    });

    let parsed: { answer: string; confidence: number; note?: string };

    try {
      const raw = completion.choices[0]?.message?.content ?? '{}';
      parsed = JSON.parse(raw);
      parsed.answer =
        typeof parsed.answer === 'string'
          ? parsed.answer
          : String(parsed.answer ?? '');
      parsed.confidence = Number.isFinite(parsed.confidence)
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0;
    } catch {
      parsed = {
        answer: completion.choices[0]?.message?.content ?? '',
        confidence: 0,
        note: 'Failed to parse structured LLM response',
      };
    }

    const response = {
      message: parsed.answer,
      confidence: parsed.confidence,
      note: parsed.note,
    };

    // RULE 1: Declare uncertainty if confidence low
    if (response.confidence < minConfidence) {
      return {
        type: 'uncertain',
        message: response.message,
        confidence: response.confidence,
        note:
          response.note ||
          'AI_RULES_MANDATORY.md: Declaring uncertainty due to low confidence',
      };
    }

    // Log decision
    await auditLogger.logDecision({
      agentId: this.agentType,
      input: prompt,
      output: response.message,
      confidence: response.confidence,
      sources: options.context,
    });

    return {
      type: 'verified',
      message: response.message,
      confidence: response.confidence,
    };
  }

  /**
   * RULE 6: Least privilege enforcement
   */
  protected async accessResource<T>(
    resource: string,
    operation: 'read' | 'write' | 'delete',
    action: () => Promise<T>,
  ): Promise<T> {
    await AIRulesEnforcer.checkRulesAcknowledgment(this.agentType);

    // Check permission
    const permission = `${operation}:${resource}`;

    if (!this.permissions.includes(permission)) {
      throw new Error(
        `${this.agentType}: AI_RULES_MANDATORY.md violation - ` +
          `Missing permission: ${permission}. Least privilege violated.`,
      );
    }

    // Log access
    await auditLogger.logToolCall({
      agentId: this.agentType,
      toolName: 'accessResource',
      inputs: { resource, operation },
      outputs: 'success',
      status: 'success',
    });

    return await action();
  }

  /**
   * Check if agent has a specific permission
   */
  protected hasPermission(permission: string): boolean {
    return this.permissions.includes(permission);
  }

  /**
   * Spawn a child agent to handle delegated work
   * This is a placeholder - actual implementation will use AgentManagerService
   */
  protected async spawnChildAgent(
    agentType: string,
    capabilities: string[],
  ): Promise<string> {
    // This will be implemented by AgentManagerService
    // For now, return a placeholder ID
    const childId = `${this.agentType}-child-${Date.now()}`;
    this.children.set(childId, {
      id: childId,
      agentType,
      capabilities,
      status: 'idle',
      currentWorkload: 0,
    });
    return childId;
  }

  /**
   * Delegate a task to a child agent
   */
  protected async delegateTask(
    childId: string,
    _task: DelegatedTask,
  ): Promise<TaskResult> {
    const child = this.children.get(childId);
    if (!child) {
      throw new Error(`Child agent ${childId} not found`);
    }

    if (child.status === 'error') {
      throw new Error(`Child agent ${childId} is in error state`);
    }

    if (child.currentWorkload >= this.maxConcurrentTasks) {
      throw new Error(`Child agent ${childId} is at capacity`);
    }

    // Update workload
    child.currentWorkload++;
    child.status = 'busy';

    try {
      // This will be implemented by TaskQueueService
      // For now, return a placeholder result
      const result: TaskResult = {
        success: true,
        data: { message: 'Task delegated (placeholder)' },
      };
      return result;
    } finally {
      child.currentWorkload--;
      child.status = child.currentWorkload > 0 ? 'busy' : 'idle';
    }
  }

  /**
   * Aggregate results from multiple child agents
   */
  protected async aggregateResults(results: TaskResult[]): Promise<TaskResult> {
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    if (failed.length === 0) {
      return {
        success: true,
        data: successful.map((r) => r.data),
        metadata: {
          total: results.length,
          successful: successful.length,
          failed: 0,
        },
      };
    }

    if (successful.length === 0) {
      return {
        success: false,
        error: 'All child tasks failed',
        metadata: {
          total: results.length,
          successful: 0,
          failed: failed.length,
          errors: failed.map((r) => r.error),
        },
      };
    }

    // Partial success
    return {
      success: true,
      data: successful.map((r) => r.data),
      metadata: {
        total: results.length,
        successful: successful.length,
        failed: failed.length,
        errors: failed.map((r) => r.error),
      },
    };
  }

  /**
   * Get current workload
   */
  getWorkload(): number {
    return this.currentWorkload;
  }

  /**
   * Check if agent can accept more tasks
   */
  canAcceptTask(): boolean {
    return this.currentWorkload < this.maxConcurrentTasks;
  }

  /**
   * Get child agents
   */
  getChildren(): ChildAgent[] {
    return Array.from(this.children.values());
  }
}
