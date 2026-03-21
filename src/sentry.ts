import * as Sentry from '@sentry/node';
import type { Integration } from '@sentry/types';
import logger from './utils/logger';

async function buildIntegrations(): Promise<Integration[]> {
  const integrations: Integration[] = [
    new Sentry.Integrations.Http({ tracing: true }),
    new Sentry.Integrations.Express({ app: undefined }),
  ];

  const profilingEnabled =
    process.env.SENTRY_ENABLE_PROFILING !== 'false' &&
    process.env.SENTRY_ENABLE_PROFILING !== '0';

  if (!profilingEnabled) {
    logger.info('Sentry profiling disabled via env SENTRY_ENABLE_PROFILING');
    return integrations;
  }

  try {
    const { ProfilingIntegration } = await import('@sentry/profiling-node');
    integrations.push(new ProfilingIntegration());
  } catch (error) {
    logger.warn('Sentry profiling disabled (native module not available)', {
      error,
    });
  }

  return integrations;
}

// Initialize Sentry for error tracking and performance monitoring
export async function initSentry(): Promise<void> {
  // Only initialize if DSN is provided
  if (!process.env.SENTRY_DSN) {
    logger.warn('Sentry DSN not found. Skipping Sentry initialization.');
    return;
  }

  const integrations = await buildIntegrations();

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.SENTRY_RELEASE || 'jarvis-v4@unknown',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1,
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1,
    integrations,
    beforeSend(event, _hint) {
      logger.info('Sending error to Sentry', {
        eventId: event.event_id,
        level: event.level,
      });

      if (event.request) {
        delete event.request.cookies;
        delete event.request.headers?.authorization;
        delete event.request.headers?.cookie;
      }

      return event;
    },
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'Non-Error promise rejection captured',
    ],
  });

  logger.info('Sentry initialized successfully', {
    environment: process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE,
  });
}

// Export Sentry for use in other files
export { Sentry };
