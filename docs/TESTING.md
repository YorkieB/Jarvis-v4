# Testing Guide (Regression & Reliability)

## Quick Commands
- All tests: `npm test`
- Unit only: `npm test -- --runTestsByPath tests/unit`
- Integration only: `npm test -- --runTestsByPath tests/integration`
- Smoke (existing): `npm run test:smoke` (if configured)

## Regression Matrix

| Area | Env Flags | Automated Coverage | Expected Outcome | Notes |
| --- | --- | --- | --- | --- |
| Dialogue / Self-RAG / LangGraph | `LANGGRAPH_MAX_HOPS`, `LANGGRAPH_STEP_TIMEOUT_MS` | `tests/unit/langgraph.test.ts` (expanded), dialogue graph integration (existing) | Graph halts on cycles/timeouts, checkpoints saved with runId | Fallback to direct Self-RAG on engine failure |
| MCP tools & FS resource | `MCP_FS_ALLOWED_ROOTS` | `tests/integration/mcp.test.ts` | ACL blocks deny; schema validation errors surfaced; FS limited to allowed roots | Temp dir used in tests |
| Sandboxed execution | `SANDBOX_ENABLED`, `SANDBOX_FORCE`, `SANDBOX_FALLBACK_HOST`, `SANDBOX_ALLOW`, `SANDBOX_DENY`, `SANDBOX_ALLOW_NETWORK` | `tests/integration/systemExecutor.sandbox.test.ts` | Commands routed to sandbox per policy; no host fallback when disabled | SandboxAdapter mocked; no real VM calls |
| Backups | `BACKUP_DIR`, `DATABASE_URL`, `BACKUP_RETENTION_DAYS` | `tests/integration/backupService.test.ts` | Backup metadata emitted, list/cleanup respects retention | `child_process.exec` mocked; temp dirs |
| Voice authentication | `VOICE_AUTH_ENABLED`, `DEEPGRAM_API_KEY` | `tests/integration/voiceAuthService.test.ts` | Enroll requires ≥3 samples/10s; verify gates by similarity; status query works | Deepgram + Prisma mocked |
| Error detection hooks | `CODE_AUTO_FIX_ENABLED` | `tests/unit/errorHandler.test.ts` | Runtime errors trigger detectRuntimeError when enabled | Uses stub service |
| PM2 watchdog | — | Manual describe | PM2 entry present with sane restart policy | No runtime change in tests |
| Observability counters | — | Manual log/metric check | Executor logs redacted cmd; counters for sandbox/host/blocked/fallback, backup success/failure, cleanup counts | See `utils/metrics.ts`, `SystemExecutor`, `BackupService` |

## Manual / CLI Checks
- Backups: `npm run backup:create`, `npm run backup:list`, `npm run backup:cleanup` (dry-run environment). Verify `.meta`, `.sha256`, retention.
- Sandbox health: call `SystemControlAgent.sandboxHealth()` with `SANDBOX_ENABLED=true`, `SANDBOX_FALLBACK_HOST=false`.
- PM2: `pm2 describe watchdog-agent` (or equivalent) to confirm restart policy (max_restarts/min_uptime/restart_delay).

## Pre-requisites & Safety
- Ensure `@google-cloud/speech` version resolves (downgrade to a published version like `^7.5.0` before fresh installs) then install optional `e2b`.
- Use temp directories for backup tests; never point to production paths.
- Keep network off for sandbox tests (`SANDBOX_ALLOW_NETWORK=false`) unless explicitly needed.
