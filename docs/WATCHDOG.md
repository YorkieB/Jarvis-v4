# Watchdog Agent Health & Restart Policy

## PM2 Configuration

- Process name: `watchdog-agent`
- Script: `./dist/agents/watchdog/start.js`
- Restart policy: `max_restarts: 10`, `min_uptime: 10s`, `restart_delay: 5000ms`

## Verifying Health

1. Describe the process:

```
pm2 describe watchdog-agent
```

- Confirm status is `online`
- Check `restarts` does not grow repeatedly
- Ensure `pm_uptime` exceeds `min_uptime` after start

2. Tail logs:

```
pm2 logs watchdog-agent --lines 100
```

3. Optional liveness hook

- If the watchdog exposes HTTP health, curl it (example):

```
curl -f http://localhost:3000/health/watchdog
```

(Adjust host/port/path to your deployment.)

## Deployment Notes

- Keep the restart delay (5s) to avoid crash loops.
- Use `pm2 save` after updating ecosystem to persist config.
- For CI/ops, fail fast if `pm2 describe watchdog-agent` reports `stopped`/`errored`.
