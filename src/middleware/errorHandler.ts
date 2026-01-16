import { Request, Response, NextFunction } from 'express';
import { Sentry } from '../sentry';
import logger from '../utils/logger';
import { ErrorDetectionService } from '../services/errorDetectionService';

// Global error detection service instance
let errorDetectionService: ErrorDetectionService | null = null;

export function setErrorDetectionService(service: ErrorDetectionService): void {
  errorDetectionService = service;
}

// Custom error class for application errors
export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Global error handler middleware
export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  // Default to 500 server error
  let statusCode = 500;
  let message = 'Internal Server Error';

  // If it's an operational error, use its status code and message
  if (err instanceof AppError && err.isOperational) {
    statusCode = err.statusCode;
    message = err.message;
  }

  // Log error with Winston
  logger.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    statusCode,
    path: req.path,
    method: req.method,
    ip: req.ip,
  });

  // Detect error for code self-healing (if enabled)
  if (errorDetectionService && process.env.CODE_AUTO_FIX_ENABLED !== 'false') {
    // Only detect runtime errors (not operational errors)
    if (!(err instanceof AppError && err.isOperational)) {
      void errorDetectionService.detectRuntimeError(err, err.stack).catch((detectError) => {
        logger.warn('Failed to detect error for auto-fix', { detectError });
      });
    }
  }

  // Send error to Sentry for non-operational errors
  if (!(err instanceof AppError && err.isOperational)) {
    Sentry.captureException(err, {
      contexts: {
        request: {
          method: req.method,
          url: req.url,
          headers: {
            'user-agent': req.get('user-agent'),
          },
        },
      },
    });
  }

  // Send response to client
  res.status(statusCode).json({
    status: 'error',
    statusCode,
    message,
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
    }),
  });
}

// Handle unhandled promise rejections
export function handleUnhandledRejection() {
  process.on('unhandledRejection', (reason: Error) => {
    logger.error('Unhandled Rejection:', {
      message: reason.message,
      stack: reason.stack,
    });

    // Detect error for code self-healing
    if (errorDetectionService && process.env.CODE_AUTO_FIX_ENABLED !== 'false') {
      void errorDetectionService.detectRuntimeError(reason, reason.stack).catch((detectError) => {
        logger.warn('Failed to detect unhandled rejection for auto-fix', { detectError });
      });
    }

    Sentry.captureException(reason);
  });
}

// Handle uncaught exceptions
export function handleUncaughtException() {
  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception:', {
      message: error.message,
      stack: error.stack,
    });

    // Detect error for code self-healing (before exit)
    if (errorDetectionService && process.env.CODE_AUTO_FIX_ENABLED !== 'false') {
      void errorDetectionService.detectRuntimeError(error, error.stack).catch((detectError) => {
        logger.warn('Failed to detect uncaught exception for auto-fix', { detectError });
      });
    }

    Sentry.captureException(error);
    // Exit process after logging
    process.exit(1);
  });
}
