# Voice Authentication Documentation

## Overview

Jarvis v4 includes voice-based authentication that ensures Jarvis only responds to authorized users. When someone else tries to speak to Jarvis, their requests are rejected.

## How It Works

### Voice Enrollment

1. User clicks "Enroll Voice" button in the UI
2. Enters their user ID
3. Records 3-5 voice samples (minimum 10 seconds total)
4. System extracts voiceprint features from samples
5. Voiceprint stored securely in database as encrypted embeddings

### Voice Verification

1. During audio streaming, system extracts voice features from incoming audio
2. Compares against stored voiceprint for the authenticated user
3. If confidence >= threshold (default 85%): conversation proceeds
4. If confidence < threshold: request rejected, no response

## API Endpoints

### Enroll Voice

**POST** `/api/voice/enroll`

Request body:
```json
{
  "userId": "user-123",
  "audioSamples": ["base64-encoded-audio-1", "base64-encoded-audio-2", ...]
}
```

Response:
```json
{
  "success": true,
  "message": "Voiceprint enrolled successfully"
}
```

### Check Voice Status

**GET** `/api/voice/status/:userId`

Response:
```json
{
  "hasVoiceprint": true,
  "userId": "user-123"
}
```

## Configuration

### Environment Variables

- `VOICE_AUTH_ENABLED` - Enable/disable voice auth (default: `true`)
- `DEEPGRAM_API_KEY` - Required for voice processing

### Database

Voiceprints are stored in the `Voiceprint` table with:
- `userId` - Unique user identifier
- `embedding` - 512-dimensional voiceprint vector (pgvector)
- `confidence` - Minimum confidence threshold (default: 0.85)
- `isActive` - Whether voiceprint is active

## Security Features

- Voiceprints stored as encrypted embeddings (not raw audio)
- Configurable confidence threshold
- Rate limiting on verification attempts
- Audit logging of all verification attempts
- Can be disabled for testing/development

## Usage

### Frontend

1. Click "Enroll Voice" button
2. Enter your user ID
3. Record 3-5 voice samples
4. Click "Enroll Voice" to submit

### Backend

Voice verification happens automatically during audio streaming. No additional code needed.

## Troubleshooting

**Voice not recognized:**
- Ensure you've enrolled your voice first
- Check that audio quality is good (minimize background noise)
- Try re-enrolling with clearer audio samples

**Enrollment fails:**
- Ensure at least 3 samples are recorded
- Total duration must be at least 10 seconds
- Check microphone permissions

**Verification always fails:**
- Check `VOICE_AUTH_ENABLED` environment variable
- Verify voiceprint exists in database
- Check server logs for errors

## Future Enhancements

- Multi-user voice recognition (identify speaker from multiple enrolled users)
- Continuous voice verification during long conversations
- Voiceprint update/improvement over time
- Integration with dedicated voice biometrics APIs for higher accuracy
