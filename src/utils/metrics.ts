/**
 * Minimal in-memory metrics recorder.
 * Intended for lightweight counters with optional labels.
 */
import logger from './logger';

type Labels = Record<string, string | number | boolean | undefined>;

function formatLabels(labels?: Labels): string | undefined {
  if (!labels) return undefined;
  const entries = Object.entries(labels).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return undefined;
  return entries.map(([k, v]) => `${k}=${v}`).join(',');
}

export class MetricsRecorder {
  private counters = new Map<string, number>();

  increment(name: string, labels?: Labels, value = 1): void {
    const key = labels ? `${name}{${formatLabels(labels)}}` : name;
    const next = (this.counters.get(key) || 0) + value;
    this.counters.set(key, next);
    logger.debug('metric.increment', { name, labels, value, total: next });
  }

  get(name: string, labels?: Labels): number | undefined {
    const key = labels ? `${name}{${formatLabels(labels)}}` : name;
    return this.counters.get(key);
  }
}

export const metrics = new MetricsRecorder();
