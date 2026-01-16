import {
  AppError,
  errorHandler,
  setErrorDetectionService,
} from '../../src/middleware/errorHandler';

describe('errorHandler auto-fix integration', () => {
  const detectRuntimeError = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    setErrorDetectionService({ detectRuntimeError } as any);
    process.env.CODE_AUTO_FIX_ENABLED = 'true';
  });

  it('invokes error detection for non-operational errors', async () => {
    const req: any = { path: '/test', method: 'GET', ip: '127.0.0.1' };
    const res: any = {
      statusCode: 0,
      body: undefined as unknown,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        this.body = payload;
        return this;
      },
    };

    await errorHandler(new Error('boom'), req, res, () => {});
    expect(detectRuntimeError).toHaveBeenCalled();
    expect(res.statusCode).toBe(500);
  });

  it('skips detection for operational AppError', async () => {
    const req: any = { path: '/test', method: 'GET', ip: '127.0.0.1' };
    const res: any = {
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        this.body = payload;
        return this;
      },
    };

    await errorHandler(new AppError('op', 400, true), req, res, () => {});
    expect(detectRuntimeError).not.toHaveBeenCalled();
  });
});
