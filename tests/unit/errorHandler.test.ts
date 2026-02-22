import {
  AppError,
  errorHandler,
  setErrorDetectionService,
} from '../../src/middleware/errorHandler';
import { ErrorDetectionService } from '../../src/services/errorDetectionService';
import { Request, Response } from 'express';

describe('errorHandler auto-fix integration', () => {
  const detectRuntimeError = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
    setErrorDetectionService({
      detectRuntimeError,
    } as Partial<ErrorDetectionService> as ErrorDetectionService);
    process.env.CODE_AUTO_FIX_ENABLED = 'true';
  });

  it('invokes error detection for non-operational errors', async () => {
    const req = {
      path: '/test',
      method: 'GET',
      ip: '127.0.0.1',
      url: '/test',
      get: jest.fn().mockReturnValue('test-user-agent'),
    } as Partial<Request> as Request;
    let resStatusCode = 0;
    const res = {
      get statusCode() { return resStatusCode; },
      status(code: number) { resStatusCode = code; return res; },
      json(_payload: unknown) { return res; },
    } as unknown as Response;

    await errorHandler(new Error('boom'), req, res, () => {});
    expect(detectRuntimeError).toHaveBeenCalled();
    expect(res.statusCode).toBe(500);
  });

  it('skips detection for operational AppError', async () => {
    const req = {
      path: '/test',
      method: 'GET',
      ip: '127.0.0.1',
      url: '/test',
      get: jest.fn().mockReturnValue('test-user-agent'),
    } as Partial<Request> as Request;
    const res = {
      status(_code: number) { return res; },
      json(_payload: unknown) { return res; },
    } as unknown as Response;

    // errorHandler expects 4 arguments (err, req, res, next)
    // AppError constructor takes 2 arguments (message, statusCode); isOperational is always true
    await errorHandler(new AppError('op', 400), req, res, () => {});
    expect(detectRuntimeError).not.toHaveBeenCalled();
  });
});
