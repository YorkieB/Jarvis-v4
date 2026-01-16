import { mediaSafetyMiddleware } from '../../src/middleware/mediaSafety';
import {
  MediaSafetyService,
  MediaSafetyDecision,
} from '../../src/services/mediaSafetyService';

function mockDecision(
  action: MediaSafetyDecision['action'],
): MediaSafetyDecision {
  return {
    action,
    reason: 'test',
    flaggedCategories: [],
    score: 0,
    source: 'upload',
    timestamp: new Date(),
  };
}

describe('mediaSafetyMiddleware', () => {
  it('blocks request when service decides block', () => {
    const svc = new MediaSafetyService();
    jest.spyOn(svc, 'evaluate').mockReturnValue(mockDecision('block'));

    const req: any = { body: {} };
    const statusMock = jest.fn().mockReturnThis();
    const jsonMock = jest.fn();
    const res: any = { locals: {}, status: statusMock, json: jsonMock };
    const next = jest.fn();

    mediaSafetyMiddleware(svc)(req, res, next);

    expect(statusMock).toHaveBeenCalledWith(403);
    expect(jsonMock).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('marks request sanitized when action is sanitize', () => {
    const svc = new MediaSafetyService();
    jest.spyOn(svc, 'evaluate').mockReturnValue(mockDecision('sanitize'));

    const req: any = { body: {} };
    const res: any = { locals: {} };
    const next = jest.fn();

    mediaSafetyMiddleware(svc)(req, res, next);

    expect(req.body.__sanitized).toBe(true);
    expect(next).toHaveBeenCalled();
  });
});
