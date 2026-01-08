# Jarvis v4 - Multi-Agent AI Assistant

## ⚠️ CRITICAL: For All AI Systems Working on This Project

**Before performing ANY work on this codebase, you MUST:**

1. ✅ Read [`AI_RULES_MANDATORY.md`](./AI_RULES_MANDATORY.md) in full
2. ✅ Understand and agree to follow all rules WITHOUT EXCEPTION
3. ✅ Acknowledge rules by extending `BaseAgent` class

**This applies to:**

- GitHub Copilot
- All 29 Jarvis agents
- Any coding assistants
- Any LLM-based tools
- Any future AI integrations

**NO BYPASSES. NO EXCEPTIONS. VIOLATIONS ARE LOGGED.**

---

## 🎯 Project Overview

Jarvis v4 is a comprehensive multi-agent AI assistant system with 29 specialized agents covering:

- 🗣️ **Conversational AI** - Real-time dialogue with voice support (ElevenLabs)
- 💰 **Personal Finance** - Budget tracking, savings goals, spending insights
- 💻 **Computer Control** - Windows automation, browser control, email, calendar
- 🎨 **Creative Media** - AI-generated music, images, podcasts, and videos
- 📹 **Visual Guidance** - Multi-camera computer vision for step-by-step help

---

## 🏗️ Architecture

### 29 Specialized Agents (Organized in 6 Batches)

**Batch 1: Core Conversational (7 agents)**

1. Orchestrator - Central routing and coordination
2. Dialogue - Conversation management
3. Voice - ElevenLabs TTS integration
4. Knowledge - RAG with embeddings
5. Web - Search and browsing
6. Spotify - Music playback control
7. Self-Healing - Diagnostics and auto-repair

**Batch 2: Personal Finance (5 agents)** 8. Finance - Transaction tracking and budgets 9. Savings - Goals and recommendations 10. Insights - Pattern analysis and optimization 11. Alert - Proactive notifications 12. Privacy - Data control and encryption

**Batch 3: Computer Control (5 agents)** 13. Windows Control - System automation 14. Browser Control - Web automation 15. Document Control - Word processing 16. Email Control - Gmail/Outlook 17. Calendar Control - Google Calendar

**Batch 4: Creative Media (4 agents)** 18. Music Generation - AI music creation 19. Image Generation - SDXL images 20. Podcast Generation - Multi-voice podcasts 21. Creative Memory - Personalization

**Batch 5: Video Production (4 agents)** 22. Video Generation - Image-to-video HD/4K 23. Storyboard - Timeline and scene management 24. Creation Console - Preview and editing 25. Iterative Refinement - Feedback loops

**Batch 6: Visual Guidance (4 agents)** 26. Camera Management - Multi-camera PTZ control 27. Computer Vision - Object detection and tracking 28. Visual Guidance - Step-by-step instructions 29. Edge Processor - Low-latency processing

---

## 🚀 Current Status

**✅ Foundation Complete:**

- AI Rules enforcement system
- Governance layer (rules-enforcer, audit-logger)
- Base agent class (all agents must extend)
- Project configuration (TypeScript, ESLint, Jest)
- Core documentation

**🔧 Coming in Subsequent PRs:**

- Agent implementations (batches 1-6)
- Database schema (Prisma with ~50 tables)
- Tests (unit, integration, compliance)
- Deployment configuration (PM2, Nginx)

---

## 📊 Technology Stack

- **Language:** TypeScript (100%)
- **Runtime:** Node.js 20+
- **Database:** PostgreSQL with pgvector
- **Process Manager:** PM2
- **Infrastructure:** DigitalOcean (self-hosted)
- **AI Models:** OpenAI GPT-4, ElevenLabs, SDXL

---

## 🔒 Security & Governance

This project enforces mandatory AI reliability rules:

- ✅ **No Hallucinations** - AI must declare uncertainty, never guess
- ✅ **Verified Outputs** - All code tested before claiming correctness
- ✅ **Audit Logging** - All actions logged immutably
- ✅ **Least Privilege** - Agents only have required permissions
- ✅ **Bounded Retries** - No infinite loops
- ✅ **No Bypasses** - Rules cannot be disabled

See [`AI_RULES_MANDATORY.md`](./AI_RULES_MANDATORY.md) for complete details.

---

## 🧪 Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Type checking
npm run type-check

# Linting
npm run lint

# Tests
npm test                      # Run all tests
npm run test:unit            # Unit tests only
npm run test:integration     # Integration tests only
npm run test:smoke           # Smoke tests (requires running server)

# Individual smoke test phases
npm run test:phase1          # Backend verification
npm run test:phase2          # Socket.IO audio streaming
npm run test:phase3          # Error handling

# Compliance tests
npm run test:compliance
```

### Running Smoke Tests

Smoke tests validate the audio pipeline (Phases 1-3):

1. Start the development server:
   ```bash
   npm run dev
   ```

2. In a separate terminal, run tests:
   ```bash
   npm run test:smoke
   ```

See [tests/smoke/README.md](./tests/smoke/README.md) for detailed documentation.

---

## 📁 Project Structure

```
Jarvis-v4/
├── AI_RULES_MANDATORY.md          ⚠️ READ THIS FIRST
├── src/
│   ├── index.ts                   # Entry point
│   ├── governance/                # Rules enforcement
│   │   ├── rules-enforcer.ts
│   │   └── audit-logger.ts
│   └── agents/
│       └── base-agent.ts          # Base class for all agents
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🤝 Contributing

1. Read `AI_RULES_MANDATORY.md` (required)
2. All agents must extend `BaseAgent`
3. All code must pass type-check and lint
4. All tests must pass
5. PRs require compliance check approval

---

## 📝 License

MIT

---

**🎯 Jarvis v4: Production-ready, rule-compliant, self-hosted AI assistant foundation.**
