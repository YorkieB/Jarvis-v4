import { Request, Response, NextFunction } from 'express';
import {
  MediaSafetyService,
  MediaSafetyInput,
  MediaSafetyDecision,
} from '../services/mediaSafetyService';

declare module 'express-serve-static-core' {
  interface Locals {
    mediaSafetyDecision?: MediaSafetyDecision;
  }
}

export function mediaSafetyMiddleware(service: MediaSafetyService) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const decision = service.evaluate(buildInput(req));
    res.locals.mediaSafetyDecision = decision;

    if (decision.action === 'block') {
      res.status(403).json({
        error: 'Blocked by media safety policy',
        decision,
      });
      return;
    }

    if (decision.action === 'sanitize') {
      req.body.__sanitized = true;
    }

    next();
  };
}

export function evaluateMediaSafety(service: MediaSafetyService, req: Request): MediaSafetyDecision {
  return service.evaluate(buildInput(req));
}

function buildInput(req: Request): MediaSafetyInput {
  const safetySignals = (req.body?.stabilitySafety || req.body?.safetySignals) as
    | MediaSafetyInput['safetySignals']
    | undefined;

  return {
    source: (req.body?.source as MediaSafetyInput['source']) || 'upload',
    provider: (req.body?.provider as MediaSafetyInput['provider']) || 'stability',
    safetySignals: safetySignals,
    contentType: req.body?.contentType,
    sizeBytes: req.body?.sizeBytes,
    userId: req.body?.userId,
    agentId: req.body?.agentId,
    metadata: req.body?.metadata,
  };
}
