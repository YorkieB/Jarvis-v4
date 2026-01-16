# Creative / Media Pipeline

## Capabilities

- Image: generate, variation, inpaint, outpaint, upscale (Stability-backed).
- Video: generate short clips up to 15 seconds, status polling.
- Video edit: trim, stitch, overlay via `VideoEditService` (placeholder).
- Safety: MediaSafetyService hard-blocks unsafe video; sanitize is coerced to allow for video (audit still recorded).
- Storage: In-memory `AssetStorage` with optional URL wrapping via `MEDIA_DELIVERY_BASE`, now tracks lineage (`sourceAssetIds`, `action`).

## Endpoints

- `POST /api/media/image/:action` where `action` ∈ `generate|variation|inpaint|outpaint|upscale`
  - Body (generate): `{ prompt, style?, seed?, width?, height?, userId? }`
  - Body (edits): `{ imageUrl, maskUrl?, prompt?, style?, strength?, userId? }`
- `POST /api/media/video/generate`
  - Body: `{ prompt, style?, durationSeconds?, userId? }` (capped at 15s)
- `POST /api/media/video/edit`
  - Body: `{ action: trim|stitch|overlay, sources: string[], startSeconds?, endSeconds?, overlayUrl?, prompt?, style?, userId? }`
- `GET /api/media/video/status/:id`
- `GET /api/media/video/list`
- `GET /api/media/assets`
- `GET /api/media/admin/summary` (assets + safety events)

## Safety

- Uses MediaSafetyService; videos are only blocked on `block` (sanitize coerced to allow) while still logging decisions.
- Default allowed types include images and audio/video; adjust via envs.

## Environment

- `STABILITY_API_BASE`, `STABILITY_API_KEY`
- `IMAGE_API_RETRIES` (default `1`)
- `VIDEO_API_BASE`, `VIDEO_API_KEY`, `VIDEO_API_TIMEOUT_MS` (default `20000`)
- `MEDIA_DELIVERY_BASE` (optional signed/redirect wrapper)
- `MEDIA_SAFETY_*` (thresholds, allowed types, size limits)

## Notes

- Replace in-memory `AssetStorage` with DB/object storage for production.
- Video generation is restricted to 15 seconds maximum by the service.
