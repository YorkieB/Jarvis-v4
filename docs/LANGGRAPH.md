# LangGraph Orchestration (Phase 3.4)

## Overview

We introduced a lightweight LangGraph-style engine to orchestrate multi-step agent flows with guardrails (max hops, cycle detection, per-node timeouts) and traceability.

## Components

- `src/services/langgraph/engine.ts`: core runner with hop/timeout/cycle policies and tracing.
- `src/services/langgraph/types.ts`: graph and node contracts.
- `src/services/langgraph/policies.ts`: basic guards.
- `src/services/langgraph/checkpointAdapter.ts`: persists checkpoints via `GraphCheckpoint` Prisma model (includes `runId`).
- `src/services/langgraph/flows/dialogueGraph.ts`: composite flow for Dialogue + Knowledge + Self-RAG.

## Environment Flags

- `LANGGRAPH_MAX_HOPS` (default 25)
- `LANGGRAPH_STEP_TIMEOUT_MS` (default 5000)

## Usage

```ts
const graph = buildDialogueGraph(knowledgeAgent, selfRag, graphId);
const state = await graph.run({ input: 'Hello' });
console.log(state.response);
```

## Persistence & Tracing

- Checkpoints saved through `CheckpointAdapter.save(graphId, nodeId, state, runId?)`.
- Traces returned from `LangGraphEngine.run` (`trace` array with per-node durations/errors).

## Tests

- `tests/unit/langgraph.test.ts` covers max hops, cycle detection, and per-node timeout behavior (mocked nodes).
