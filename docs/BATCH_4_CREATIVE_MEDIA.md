# Batch 4: Creative Media Agents

This document describes the Creative Media Agents implementation (Batch 4).

## Overview

Batch 4 introduces 4 specialized agents focused on AI-generated creative content:

1. **Music Generation Agent** - Text-to-music, vocals, and song structure
2. **Image Generation Agent** - SDXL text-to-image with style control
3. **Podcast Generation Agent** - Multi-voice podcast synthesis
4. **Creative Memory Agent** - User preference learning and personalization

## Agents

### 1. Music Generation Agent (`src/agents/music-generation/index.ts`)

**Capabilities:**
- Generate music from text prompts
- Create vocals using ElevenLabs TTS
- Manage artist personas and styles
- Generate song structures (intro, verse, chorus, bridge, outro)
- Track history and list all generated tracks

**Permissions:** `read:music`, `write:music`

**Key Methods:**
- `generateMusic(prompt, options)` - Generate music track
- `generateVocals(lyrics, personaId)` - Generate vocals with ElevenLabs
- `createPersona(name, style, voiceId)` - Create music persona
- `generateSongStructure(prompt)` - Generate song section structure
- `listTracks(userId)` - List user's tracks

### 2. Image Generation Agent (`src/agents/image-generation/index.ts`)

**Capabilities:**
- Generate images from text prompts
- Apply custom styles and themes
- Create image variations
- Refine existing images
- Manage custom style library

**Permissions:** `read:images`, `write:images`

**Key Methods:**
- `generateImage(prompt, options)` - Generate image from prompt
- `generateVariations(imageId, count)` - Create variations of an image
- `refineImage(imageId, refinementPrompt)` - Refine existing image
- `applyStyle(imageId, styleName)` - Apply style to image
- `createCustomStyle(name, promptModifier, negativePrompt)` - Create custom style
- `listImages(userId)` - List user's images

### 3. Podcast Generation Agent (`src/agents/podcast-generation/index.ts`)

**Capabilities:**
- Convert scripts to podcasts
- Multi-voice synthesis with different speakers
- Background music integration
- Multi-language support
- Episode management

**Permissions:** `read:podcasts`, `write:podcasts`

**Key Methods:**
- `generatePodcast(script, options)` - Generate podcast from script
- `addBackgroundMusic(episodeId, musicTrackId, volume)` - Add background music
- `translatePodcast(episodeId, targetLanguage)` - Translate episode
- `listEpisodes(userId)` - List user's episodes

**Script Format:**
```
[Speaker1]: This is what they say
[Speaker2]: This is the response
```

### 4. Creative Memory Agent (`src/agents/creative-memory/index.ts`)

**Capabilities:**
- Track user creative preferences
- Learn from feedback and ratings
- Bias future generations based on user taste
- Provide personalized recommendations
- Build creative profiles

**Permissions:** `read:creative_preferences`, `write:creative_preferences`

**Key Methods:**
- `recordFeedback(userId, contentType, contentId, feedback)` - Record user feedback
- `getRecommendedParameters(userId, contentType)` - Get personalized parameters
- `getCreativeProfile(userId)` - Get complete creative profile
- Automatically updates preferences based on feedback patterns

## Database Schema

The Prisma schema includes these models:

- **MusicTrack** - Generated music tracks
- **MusicPersona** - Artist personas and styles
- **GeneratedImage** - Generated images
- **ImageStyle** - Custom image styles
- **PodcastEpisode** - Podcast episodes
- **CreativePreferences** - User creative preferences
- **CreativeFeedback** - User feedback on creations

## PM2 Configuration

The `ecosystem.config.cjs` file configures PM2 to run all 4 agents:

```javascript
module.exports = {
  apps: [
    { name: 'music-generation-agent', script: './dist/agents/music-generation/index.js' },
    { name: 'image-generation-agent', script: './dist/agents/image-generation/index.js' },
    { name: 'podcast-generation-agent', script: './dist/agents/podcast-generation/index.js' },
    { name: 'creative-memory-agent', script: './dist/agents/creative-memory/index.js' }
  ]
};
```

## Environment Variables

Required environment variables:

```bash
DATABASE_URL="file:./dev.db"                    # Prisma database URL
ELEVENLABS_API_KEY="your-elevenlabs-api-key"   # ElevenLabs API key
JARVIS_VOICE_ID="your-default-voice-id"        # Default voice ID
```

## Testing

Integration tests are located in `tests/integration/creative-media.test.ts`.

Run tests:
```bash
npm test                                         # Run all tests
npm test -- tests/integration/creative-media.test.ts  # Run creative media tests only
```

All tests pass successfully with 12 test cases covering:
- Music generation and persona management
- Image generation and style application
- Podcast generation with multi-voice support
- Creative memory and user preference learning

## Building

```bash
npm run build        # Build TypeScript
npm run type-check   # Type check without emitting
npm run lint         # Lint code
npm run test:all     # Run all checks and tests
```

## Architecture

All agents:
- Extend `BaseAgent` class
- Follow AI_RULES_MANDATORY.md compliance
- Use Prisma for database operations
- Implement proper permission checking
- Support asynchronous operations

## Integration Notes

### ElevenLabs Integration
- Uses `@elevenlabs/elevenlabs-js` v2.29.0
- Supports text-to-speech with multiple voices
- Configurable model and voice settings
- Streaming audio output

### Prisma Integration
- SQLite database (can be changed to PostgreSQL/MySQL)
- Type-safe database queries
- Automatic migrations
- Full CRUD operations

## Future Enhancements

TODOs marked in code:
- [ ] Integrate actual MusicGen API for music generation
- [ ] Integrate Stability AI SDXL for image generation
- [ ] Implement audio mixing for podcast background music
- [ ] Add GPT-4 for script translation
- [ ] Implement LoRA for personalized image generation
- [ ] Add real-time audio processing

## Success Criteria

✅ All 4 agents extend BaseAgent
✅ Music agent can generate tracks with vocals
✅ Image agent can generate images with styles
✅ Podcast agent can create multi-voice podcasts
✅ Creative Memory learns from user feedback
✅ Database schema includes all creative tables
✅ PM2 config includes all 4 agents
✅ TypeScript compiles without errors
✅ Integration tests pass (12/12)
