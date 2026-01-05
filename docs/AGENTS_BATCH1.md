# Batch 1: Core Conversational Agents

This document provides an overview of the 7 core agents implemented in Batch 1.

## Agents Overview

### 1. Orchestrator Agent
**Location:** `src/orchestrator/index.ts`
- Central message routing to appropriate agents
- Load balancing across agent instances  
- Session management
- WebSocket and REST API endpoints
- Listens on port 3000 (configurable via PORT env var)

### 2. Dialogue Agent
**Location:** `src/agents/dialogue/index.ts`
- Bidirectional conversation management using GPT-4
- Context preservation across conversation turns
- Session-based conversation history
- Integrates with OpenAI API

### 3. Voice Agent  
**Location:** `src/agents/voice/index.ts`
- Text-to-speech using ElevenLabs
- Speech-to-text (Deepgram - TODO)
- Voice synthesis with configurable voice settings

### 4. Knowledge Agent
**Location:** `src/agents/knowledge/index.ts`
- RAG (Retrieval Augmented Generation)
- Vector embeddings with OpenAI
- Document ingestion and chunking
- Semantic search (pgvector integration - TODO)

### 5. Web Agent
**Location:** `src/agents/web/index.ts`
- Web search using Bing API
- Web scraping capabilities
- Real-time information retrieval

### 6. Spotify Agent
**Location:** `src/agents/spotify/index.ts`
- Spotify playback control
- Track search
- Play/pause functionality
- OAuth integration (TODO)

### 7. Self-Healing Agent
**Location:** `src/agents/self-healing/index.ts`
- Agent health monitoring via PM2
- Auto-restart failed agents
- Performance diagnostics
- 30-second monitoring interval

## Architecture

All agents extend `BaseAgent` which provides:
- AI Rules acknowledgment (AI_RULES_MANDATORY.md compliance)
- LLM call grounding and verification
- Permission-based access control
- Audit logging

## Database Schema

The Prisma schema includes:
- User and Session management
- Conversation and Message history
- Knowledge Base with pgvector for embeddings
- Agent Health monitoring
- Audit Log for compliance

## Deployment

Use PM2 to manage all agents:
```bash
pm2 start ecosystem.config.cjs
```

This will start:
- 1x Orchestrator instance
- 2x Dialogue Agent instances
- 1x Voice Agent instance
- 2x Knowledge Agent instances
- 1x Web Agent instance
- 1x Spotify Agent instance
- 1x Self-Healing Agent instance

## Environment Variables Required

```
OPENAI_API_KEY=your_openai_key
ELEVENLABS_API_KEY=your_elevenlabs_key
JARVIS_VOICE_ID=your_voice_id
BING_API_KEY=your_bing_key
SPOTIFY_ACCESS_TOKEN=your_spotify_token
DATABASE_URL=postgresql://...
PORT=3000
```

## Testing

Run tests with:
```bash
npm test                  # All tests
npm run test:unit         # Unit tests only
npm run test:integration  # Integration tests only
```

## Next Steps

Future enhancements:
- Implement inter-agent message queue communication
- Complete Deepgram speech-to-text integration
- Add Spotify OAuth flow
- Implement pgvector database queries
- Add more comprehensive test coverage
