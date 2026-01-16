# Media Safety & NSFW Controls

## Overview

Media safety wraps Stability safety signals (when present) and a lightweight local fallback (type/size heuristics) to block or sanitize risky assets before delivery.

## Policy

- Actions: `block`, `sanitize`, `allow`
- Block when any Stability probability >= `MEDIA_SAFETY_BLOCK_THRESHOLD`
- Sanitize when probability is between sanitize/block thresholds or when uploads exceed size limits
- Allow only when under thresholds and heuristics pass

## Environment Variables

- `MEDIA_SAFETY_BLOCK_THRESHOLD` (default `0.9`)
- `MEDIA_SAFETY_SANITIZE_THRESHOLD` (default `0.75`)
- `MEDIA_SAFETY_ALLOWED_CONTENT_TYPES` (CSV, default `image/jpeg,image/png,image/webp`)
- `MEDIA_SAFETY_MAX_SIZE_BYTES` (default `10485760` / 10MB)
- `MEDIA_SAFETY_ENABLE_LOCAL_FALLBACK` (default `true`)

## Endpoints

- `POST /api/media/safety/evaluate`
  - Body: `{ source, provider, stabilitySafety|safetySignals, contentType, sizeBytes, userId, agentId, metadata }`
  - Returns: `{ success, decision }`
- `GET /api/media/safety/events`
  - Returns recent decisions and whether any alerts exist
- `POST /api/media/upload` (sample-protected path)
  - Runs safety middleware; responds 403 on block, or marks `sanitized` if action is `sanitize`

## Logging & Audit

- Decisions are recorded via `auditLogger` and kept in a small in-memory buffer for quick admin review.
- Warnings are emitted in logs for `block`/`sanitize` actions.

## Usage Notes

- Pass Stability safety signals from generation responses (array of `{ category, probability }`).
- For uploads without signals, provide `contentType` and `sizeBytes` to enable local heuristics.
- The middleware sets `req.body.__sanitized = true` when the action is `sanitize` so downstream handlers can adjust behavior.
