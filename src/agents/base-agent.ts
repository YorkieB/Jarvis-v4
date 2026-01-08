/**
 * Base Agent Class
 *
 * ALL agents MUST extend this class
 * Enforces AI_RULES_MANDATORY.md compliance
 */

import { AIRulesEnforcer } from '../governance/rules-enforcer';
import { auditLogger } from '../governance/audit-logger';

export abstract class BaseAgent {
  protected abstract agentType: string;
  protected abstract permissions: string[];

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
    options: { context?: any; confidence?: number } = {},
  ): Promise<any> {
    // Check rules acknowledged
    await AIRulesEnforcer.checkRulesAcknowledgment(this.agentType);

    // RULE 2: Must have context (grounding)
    if (!options.context) {
      throw new Error(
        `${this.agentType}: AI_RULES_MANDATORY.md violation - ` +
          `LLM calls must be grounded in context. Read files first.`,
      );
    }

    // TODO: Implement actual LLM call with self-verification
    const response = { message: 'Response', confidence: 0.95 };

    // RULE 1: Declare uncertainty if confidence low
    if (response.confidence < 0.9) {
      return {
        type: 'uncertain',
        message: response.message,
        confidence: response.confidence,
        note: 'AI_RULES_MANDATORY.md: Declaring uncertainty due to low confidence',
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
}
