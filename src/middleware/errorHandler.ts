import { Request, Response, NextFunction } from 'express';
import { Sentry } from '../sentry';
import logger from '../utils/logger';

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
  next: NextFunction
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

  // Send error to Sentry for non-operational errors
  if (!((err instanceof AppError) && err.isOperational)) {
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
    Sentry.captureException(error);
    // Exit process after logging
    process.exit(1);
  });
}
