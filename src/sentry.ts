import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';
import logger from './utils/logger';

// Initialize Sentry for error tracking and performance monitoring
export function initSentry() {
  // Only initialize if DSN is provided
  if (!process.env.SENTRY_DSN) {
    logger.warn('Sentry DSN not found. Skipping Sentry initialization.');
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,

    // Set environment (production, development, staging)
    environment: process.env.NODE_ENV || 'development',

    // Release tracking for identifying which version has issues
    release: process.env.SENTRY_RELEASE || 'jarvis-v4@unknown',

    // Sample rate for error tracking (1.0 = 100% of errors)
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Sample rate for profiling (lower in production to reduce overhead)
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Enable performance monitoring
    integrations: [
      // Enable HTTP tracking
      new Sentry.Integrations.Http({ tracing: true }),

      // Enable Express.js integration
      new Sentry.Integrations.Express({ app: undefined }),

      // Enable profiling for performance insights
      new ProfilingIntegration(),
    ],

    // Filter out sensitive information
    beforeSend(event, _hint) {
      // Log to Winston when sending to Sentry
      logger.info('Sending error to Sentry', {
        eventId: event.event_id,
        level: event.level,
      });

      // Remove sensitive data from event
      if (event.request) {
        delete event.request.cookies;
        delete event.request.headers?.authorization;
        delete event.request.headers?.cookie;
      }

      return event;
    },

    // Ignore certain errors
    ignoreErrors: [
      // Browser-specific errors that shouldn't appear in Node.js
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
