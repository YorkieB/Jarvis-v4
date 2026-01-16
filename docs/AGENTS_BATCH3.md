# Batch 3: Computer Control (Cross-Platform)

## Agents
- **SystemControlAgent** (`src/agents/system-control/index.ts`): executes system commands, remediation actions, registry (Windows) operations.
- **Alert routing**: orchestrator maps `system_control` tasks to SystemControlAgent.

## Services
- **SystemExecutor** (`src/services/systemExecutor.ts`): safe command exec with allow/deny lists, dry-run, per-shell (cmd/powershell/bash).
- **SystemActions** (`src/services/systemActions.ts`): processes, services, files, network ping/port, registry (Windows only).
- **RemediationLibrary** (`src/services/remediationLibrary.ts`): fixes (DNS flush, network reset, audio restart, temp cleanup, Windows Update restart).

## API Endpoints (guarded)
- Requires `SYSTEM_CONTROL_ENABLED=true` and header `x-system-token` matching `SYSTEM_CONTROL_AUTH_TOKEN`.
- `POST /api/system/exec` `{ cmd, shell?, timeoutMs?, dryRun? }`.
- `POST /api/system/fix/:action` where action ∈ `flush_dns|reset_network|restart_audio|clear_temp|restart_windows_update`.
- `POST /api/system/registry` (Windows) `{ path, name?, value?, mode: 'read'|'write' }`.
- `POST /api/system/service/restart` `{ name }`.
- `GET /api/system/processes`.

## Environment Variables
- `SYSTEM_CONTROL_ENABLED` (default false)
- `SYSTEM_CONTROL_AUTH_TOKEN` (required when enabled)
- `SYSTEM_CONTROL_ALLOW` (CSV allowlist prefixes; optional)
- `SYSTEM_CONTROL_DENY` (CSV deny patterns; optional)
- `ALERT_HIGH_SPEND_THRESHOLD` (already used elsewhere; unrelated but present)

## Safety
- Allow/deny checks on commands; dry-run support.
- Registry ops gated to Windows only.
- No elevation handled; commands run with current process privileges.

## Notes
- Only local host control (no remote/SSH).
- Logs redact token-like strings and record executed commands/results.
