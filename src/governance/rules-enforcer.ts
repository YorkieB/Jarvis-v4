/**
 * AI Rules Enforcement Layer
 * Ensures ALL AI in this project follows AI_RULES_MANDATORY.md
 */

interface RuleViolation {
  rule: string;
  severity: 'critical' | 'warning';
  message: string;
}

interface ValidationResult {
  valid: boolean;
  violations: RuleViolation[];
}

interface AIAction {
  type: string;
  aiSystemId: string;
  confidence?: number;
  declaredUncertainty?: boolean;
  sources?: any[];
  verified?: boolean;
  requestedPermissions?: string[];
  maxRetries?: number;
}

export class AIRulesEnforcer {
  private static rulesAcknowledged = new Set<string>();
  
  /**
   * MUST be called before ANY AI performs work
   */
  static async checkRulesAcknowledgment(aiSystemId: string): Promise<void> {
    if (!this.rulesAcknowledged.has(aiSystemId)) {
      throw new RulesNotAcknowledgedError(
        `AI system "${aiSystemId}" must read and acknowledge AI_RULES_MANDATORY.md before performing any work.`
      );
    }
  }
  
  /**
   * AI acknowledges it has read and will follow the rules
   */
  static acknowledgeRules(aiSystemId: string): void {
    this.rulesAcknowledged.add(aiSystemId);
    console.log(`✅ ${aiSystemId} acknowledged AI_RULES_MANDATORY.md`);
  }
  
  /**
   * Check if an action violates rules
   */
  static async validateAction(action: AIAction): Promise<ValidationResult> {
    const violations: RuleViolation[] = [];
    
    // Rule 1: No guessing (low confidence without declaring uncertainty)
    if (action.type === 'response' && 
        action.confidence !== undefined && 
        action.confidence < 0.9 && 
        !action.declaredUncertainty) {
      violations.push({
        rule: 'no_guessing',
        severity: 'critical',
        message: 'Low confidence response without declaring uncertainty'
      });
    }
    
    // Rule 2: Grounding required
    if (action.type === 'response' && (!action.sources || action.sources.length === 0)) {
      violations.push({
        rule: 'grounding_required',
        severity: 'critical',
        message: 'Response not grounded in verified sources'
      });
    }
    
    // Rule 3: Verification required for code
    if (action.type === 'code_generation' && !action.verified) {
      violations.push({
        rule: 'code_verification',
        severity: 'critical',
        message: 'Code generated without verification'
      });
    }
    
    // Rule 8: Bounded retries
    if (action.type === 'tool_call' && 
        (!action.maxRetries || action.maxRetries > 5)) {
      violations.push({
        rule: 'bounded_retries',
        severity: 'warning',
        message: 'Tool call should have max 3-5 retries'
      });
    }
    
    return {
      valid: violations.length === 0,
      violations
    };
  }
}

export class RulesNotAcknowledgedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RulesNotAcknowledgedError';
  }
}
