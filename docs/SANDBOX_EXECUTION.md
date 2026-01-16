# Sandboxed Execution (Phase 3.3)

This document describes how sandboxed command execution works using E2B micro-VMs and how to configure it.

## Overview

- All commands go through `SystemExecutor`. When sandboxing is enabled, commands that match the sandbox policy are executed in an E2B micro-VM; others run on the host as before.
- Policy can force sandboxing, allowlist, or denylist specific command prefixes.
- Network access is disabled by default inside the sandbox.

## Key Components

- `src/services/sandbox/e2bSandboxService.ts` — wraps the E2B SDK (create/run/cleanup).
- `src/services/sandbox/sandboxAdapter.ts` — policy guard + health check + logging.
- `src/services/systemExecutor.ts` — routes commands to sandbox or host, with optional fallback.
- `src/agents/system-control/index.ts` — exposes sandbox health and uses `SystemExecutor`.

## Environment Variables

- `SANDBOX_ENABLED` (default `false`): turn on sandbox routing.
- `SANDBOX_FORCE` (default `false`): sandbox all commands (except policy-denied host runs).
- `SANDBOX_ALLOW`: comma list of command prefixes that _may_ run in sandbox (e.g., `python,node`).
- `SANDBOX_DENY`: comma list of substrings that _must_ go to sandbox (e.g., `rm -rf,/etc`).
- `SANDBOX_FALLBACK_HOST` (default `true`): if sandbox fails, run on host.
- `SANDBOX_ALLOW_NETWORK` (default `false`): enable outbound network inside sandbox.
- `SANDBOX_DEFAULT_TIMEOUT_MS` (default `20000`): sandbox default timeout.
- `SYSTEM_EXECUTOR_DEFAULT_TIMEOUT_MS` (host default timeout).
- `E2B_API_KEY` (required when sandboxing): E2B API key.
- `E2B_TEMPLATE_ID` (default `base`): E2B template to launch.

## Health Check

Call `SystemControlAgent.sandboxHealth()` (or use `SystemExecutor.sandboxHealth()`) to verify the sandbox client and API key are available.

## Dependency

Install the E2B SDK when enabling sandboxing:

```bash
npm install e2b
```

## Operational Notes

- Network is blocked by default; set `SANDBOX_ALLOW_NETWORK=true` only when needed.
- Set explicit timeouts per call via `timeoutMs` when invoking `SystemExecutor.execute`.
- Logs include sandbox vs host source and whether fallback occurred.
