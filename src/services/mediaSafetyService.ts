import logger from '../utils/logger';
import { auditLogger } from '../governance/audit-logger';

export type MediaSafetyAction = 'allow' | 'sanitize' | 'block';
export type MediaSafetySource = 'generation' | 'upload';

export interface StabilitySafetySignal {
  category: string;
  probability: number;
  severity?: number;
}

export interface MediaSafetyInput {
  source: MediaSafetySource;
  provider?: 'stability';
  safetySignals?: StabilitySafetySignal[];
  contentType?: string;
  sizeBytes?: number;
  userId?: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
}

export interface MediaSafetyDecision {
  action: MediaSafetyAction;
  reason: string;
  flaggedCategories: string[];
  score: number;
  source: MediaSafetySource;
  provider?: string;
  timestamp: Date;
  details?: Record<string, unknown>;
}

interface Thresholds {
  block: number;
  sanitize: number;
}

const DEFAULT_ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'audio/mpeg',
  'audio/mp3',
];
const DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10MB

export class MediaSafetyService {
  private thresholds: Thresholds;
  private allowedContentTypes: string[];
  private maxSizeBytes: number;
  private enableLocalFallback: boolean;
  private recentDecisions: MediaSafetyDecision[] = [];
  private recentLimit = 50;

  constructor() {
    this.thresholds = {
      block: this.readNumberEnv('MEDIA_SAFETY_BLOCK_THRESHOLD', 0.9),
      sanitize: this.readNumberEnv('MEDIA_SAFETY_SANITIZE_THRESHOLD', 0.75),
    };
    this.allowedContentTypes = this.readCsvEnv(
      'MEDIA_SAFETY_ALLOWED_CONTENT_TYPES',
      DEFAULT_ALLOWED_TYPES,
    );
    this.maxSizeBytes = this.readNumberEnv(
      'MEDIA_SAFETY_MAX_SIZE_BYTES',
      DEFAULT_MAX_SIZE,
    );
    this.enableLocalFallback =
      process.env.MEDIA_SAFETY_ENABLE_LOCAL_FALLBACK !== 'false';
  }

  evaluate(input: MediaSafetyInput): MediaSafetyDecision {
    const decisionFromStability =
      input.provider === 'stability' && input.safetySignals?.length
        ? this.evaluateStabilitySignals(input)
        : null;

    const decision =
      decisionFromStability ||
      (this.enableLocalFallback
        ? this.evaluateLocalHeuristics(input)
        : this.allow(input));

    this.recordDecision(decision, input);
    return decision;
  }

  getRecent(limit = 20): MediaSafetyDecision[] {
    return this.recentDecisions.slice(-limit).reverse();
  }

  hasRecentAlerts(): boolean {
    return this.recentDecisions.some((d) => d.action !== 'allow');
  }

  private evaluateStabilitySignals(
    input: MediaSafetyInput,
  ): MediaSafetyDecision {
    const scores = input.safetySignals ?? [];
    const worst = scores.reduce(
      (acc, curr) => (curr.probability > acc.probability ? curr : acc),
      { category: 'unknown', probability: 0 },
    );

    const flagged = scores
      .filter((s) => s.probability >= this.thresholds.sanitize)
      .map((s) => s.category);

    if (worst.probability >= this.thresholds.block) {
      return this.makeDecision(
        'block',
        'Stability safety signals exceed block threshold',
        input,
        {
          topCategory: worst.category,
          topProbability: worst.probability,
          signals: scores,
        },
      );
    }

    if (worst.probability >= this.thresholds.sanitize) {
      return this.makeDecision(
        'sanitize',
        'Stability safety signals exceed sanitize threshold',
        input,
        {
          topCategory: worst.category,
          topProbability: worst.probability,
          signals: scores,
        },
        flagged,
      );
    }

    return this.makeDecision(
      'allow',
      'Stability safety signals below thresholds',
      input,
      {
        topCategory: worst.category,
        topProbability: worst.probability,
        signals: scores,
      },
      flagged,
    );
  }

  private evaluateLocalHeuristics(
    input: MediaSafetyInput,
  ): MediaSafetyDecision {
    const flagged: string[] = [];

    if (
      input.contentType &&
      !this.allowedContentTypes.includes(input.contentType)
    ) {
      return this.makeDecision(
        'block',
        'Content type not allowed',
        input,
        { contentType: input.contentType },
        ['unsupported_content_type'],
      );
    }

    if (input.sizeBytes && input.sizeBytes > this.maxSizeBytes) {
      return this.makeDecision(
        'sanitize',
        'File size exceeds limit',
        input,
        { sizeBytes: input.sizeBytes, maxSizeBytes: this.maxSizeBytes },
        ['oversized'],
      );
    }

    return this.makeDecision(
      'allow',
      'Local heuristics allow content',
      input,
      undefined,
      flagged,
    );
  }

  private allow(input: MediaSafetyInput): MediaSafetyDecision {
    return this.makeDecision(
      'allow',
      'No safety signals provided; default allow',
      input,
    );
  }

  private makeDecision(
    action: MediaSafetyAction,
    reason: string,
    input: MediaSafetyInput,
    details?: Record<string, unknown>,
    flaggedCategories: string[] = [],
  ): MediaSafetyDecision {
    const score = this.deriveScore(action, details);
    return {
      action,
      reason,
      flaggedCategories,
      score,
      source: input.source,
      provider: input.provider,
      timestamp: new Date(),
      details,
    };
  }

  private deriveScore(
    action: MediaSafetyAction,
    details?: Record<string, unknown>,
  ): number {
    if (action === 'block') return 1;
    if (action === 'sanitize') return 0.7;
    if (details?.topProbability && typeof details.topProbability === 'number') {
      return Number(details.topProbability);
    }
    return 0;
  }

  private recordDecision(
    decision: MediaSafetyDecision,
    input: MediaSafetyInput,
  ): void {
    this.recentDecisions.push(decision);
    if (this.recentDecisions.length > this.recentLimit) {
      this.recentDecisions.shift();
    }

    void auditLogger.logDecision({
      agentId: input.agentId || 'media-safety',
      input: JSON.stringify({
        provider: input.provider,
        source: input.source,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
      }),
      output: JSON.stringify(decision),
      confidence: 1 - decision.score,
      sources: decision.flaggedCategories,
    });

    const logPayload = {
      action: decision.action,
      reason: decision.reason,
      provider: input.provider,
      source: input.source,
      flagged: decision.flaggedCategories,
    };

    if (decision.action === 'block') {
      logger.warn('MediaSafety: blocked content', logPayload);
    } else if (decision.action === 'sanitize') {
      logger.info('MediaSafety: sanitize content', logPayload);
    } else {
      logger.debug('MediaSafety: allowed content', logPayload);
    }
  }

  private readNumberEnv(key: string, fallback: number): number {
    const raw = process.env[key];
    if (!raw) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private readCsvEnv(key: string, fallback: string[]): string[] {
    const raw = process.env[key];
    if (!raw) return fallback;
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
}
