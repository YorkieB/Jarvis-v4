/**
 * Centralized LLM Configuration
 *
 * Standardizes temperature settings across all LLM calls
 * to ensure deterministic behavior where needed.
 */

export interface LLMConfig {
  temperature: number;
  maxTokens?: number;
  topP?: number;
}

export const LLM_CONFIG = {
  /**
   * Deterministic mode: temperature 0.0
   * Use for: Code generation, SQL queries, JSON formatting, structured output
   */
  deterministic: {
    temperature: 0,
    maxTokens: 2000,
  } as LLMConfig,

  /**
   * Reasoning mode: temperature 0.3
   * Use for: Problem solving, logical reasoning, analysis
   */
  reasoning: {
    temperature: 0.3,
    maxTokens: 2000,
  } as LLMConfig,

  /**
   * Creative mode: temperature 0.7
   * Use for: Creative writing, brainstorming, ideation
   */
  creative: {
    temperature: 0.7,
    maxTokens: 2000,
  } as LLMConfig,

  /**
   * Uncertainty sampling mode: temperature 0.5-0.6
   * Use for: Generating candidate responses for semantic entropy calculation
   */
  uncertainty: {
    temperature: 0.6,
    maxTokens: 500,
  } as LLMConfig,
} as const;

/**
 * Get LLM config by name
 */
export function getLLMConfig(mode: keyof typeof LLM_CONFIG): LLMConfig {
  return LLM_CONFIG[mode];
}

/**
 * Get temperature for a specific use case
 */
export function getTemperatureForUseCase(
  useCase: 'code' | 'sql' | 'json' | 'reasoning' | 'creative' | 'uncertainty',
): number {
  switch (useCase) {
    case 'code':
    case 'sql':
    case 'json':
      return LLM_CONFIG.deterministic.temperature;
    case 'reasoning':
      return LLM_CONFIG.reasoning.temperature;
    case 'creative':
      return LLM_CONFIG.creative.temperature;
    case 'uncertainty':
      return LLM_CONFIG.uncertainty.temperature;
    default:
      return LLM_CONFIG.reasoning.temperature;
  }
}
