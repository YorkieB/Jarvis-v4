# Getting Started with Jarvis v4

## Prerequisites

- Node.js 20+
- npm 10+
- Git

## Installation

1. Clone the repository:

```bash
git clone https://github.com/YorkieB/Jarvis-v4.git
cd Jarvis-v4
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment:

```bash
cp .env.example .env
# Edit .env with your API keys
```

4. Run development server:

```bash
npm run dev
```

## Understanding the Architecture

Jarvis v4 is built on three core principles:

1. **Mandatory AI Rules** - All AI must follow AI_RULES_MANDATORY.md
2. **Agent-Based Architecture** - 29 specialized agents for different tasks
3. **Governance Layer** - Enforcement and auditing built-in

## Next Steps

- Read `AI_RULES_MANDATORY.md` to understand the rules
- Check `docs/ARCHITECTURE.md` for system design
- See `src/agents/base-agent.ts` for how to create agents
