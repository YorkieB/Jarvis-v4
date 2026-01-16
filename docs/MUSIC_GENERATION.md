# Music Generation (Suno-style)

## Overview

Provides text-to-music generation with style/genre options, short hooks vs full tracks, optional stems, and basic safety gating before delivery.

## Endpoints

- `POST /api/music/generate`
  - Body: `{ prompt, style?, duration? ("hook"|"full"), stems?, tags?, userId? }`
  - Returns: `{ track, provider, decision }`
- `GET /api/music/status/:id`
- `GET /api/music/list`
- `GET /api/music/stems/:id` (safety middleware applied)

## Safety

- Uses existing `MediaSafetyService` to gate delivery; defaults now allow audio MIME types.
- Blocks if safety action is `block`; marks sanitized when needed.

## Storage

- In-memory `MusicStorage` holds track metadata; URLs resolved via `MUSIC_DELIVERY_BASE` if set. Replace with DB/object storage in production.

## Environment Variables

- `SUNO_API_BASE` (default `https://api.suno.ai`)
- `SUNO_API_KEY` (required)
- `SUNO_API_TIMEOUT_MS` (default `20000`)
- `MUSIC_DELIVERY_BASE` (optional wrapper for returned audio URLs)

## Orchestrator

- Tasks: `music_generate`, `music_variation`, `music_stems` mapped to `music-agent`.

## Tests

- Add unit coverage for Suno option building/status handling and route validation as needed.
