# Jarvis v4 - Deployment Guide

## Overview

This document describes the atomic deployment system for Jarvis v4, which provides zero-downtime deployments with automatic rollback capabilities.

## Deployment Architecture

### Release Management

- **Releases Directory**: `/var/www/releases/`
  - Each deployment creates a timestamped release directory (e.g., `20260107213000`)
  - Keeps the last 5 releases for quick rollback

- **Current Symlink**: `/var/www/current`
  - Points to the active release
  - Atomically updated during deployment

- **Application Directory**: `/var/www/jarvis`
  - Contains the git repository
  - Source for all deployments

### Process Manager

- **PM2** manages the application process
- Process name: `jarvis`
- Automatic restart on deployment

## Manual Deployment

### Deploy Latest Code

```bash
ssh root@161.35.169.117
/root/deploy.sh
```

The deployment script will:
1. Pull latest code from GitHub
2. Create timestamped release directory
3. Sync files using rsync (atomic operation)
4. Copy environment variables
5. Install dependencies
6. Run build if configured
7. Update current symlink atomically
8. Restart PM2 process
9. Clean up old releases

### Rollback to Previous Release

```bash
ssh root@161.35.169.117
/root/rollback.sh
```

The script will:
1. Display available releases
2. Prompt for release number
3. Update symlink to selected release
4. Restart application

## Automated Deployment (CI/CD)

### GitHub Actions Workflow

Deployments are automatically triggered on:
- Push to `main` branch
- After successful CI checks

### Prerequisites

1. **SSH Key Setup**:
   ```bash
   # Generate deployment key on your local machine
   ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github_deploy_key
   
   # Add public key to server
   ssh root@161.35.169.117
   mkdir -p ~/.ssh
   echo "<public_key_content>" >> ~/.ssh/authorized_keys
   chmod 600 ~/.ssh/authorized_keys
   ```

2. **GitHub Secrets**:
   - Go to Settings → Secrets and variables → Actions
   - Add secret: `DEPLOY_SSH_KEY` (private key content)
   - Add secret: `DEPLOY_HOST` (161.35.169.117)
   - Add secret: `DEPLOY_USER` (root)

## Deployment Process Details

### Atomic Deployment Steps

1. **Fetch Latest Code**
   - `git fetch origin`
   - `git reset --hard origin/main`

2. **Create Release**
   - Generate timestamp: `YYYYMMDDHHMMSS`
   - Create directory: `/var/www/releases/TIMESTAMP`

3. **Sync Files**
   - Use `rsync -a --delete` for atomic file copy
   - Exclude: `.git`, `node_modules`, `.env`, `*.log`

4. **Install Dependencies**
   - `npm ci --production`

5. **Build Application**
   - Run `npm run build` if build script exists

6. **Update Symlink**
   - `ln -sfn /var/www/releases/TIMESTAMP /var/www/current`
   - Atomic operation - no partial updates

7. **Restart Service**
   - `pm2 restart jarvis`

8. **Cleanup**
   - Keep last 5 releases
   - Delete older releases automatically

## Rollback Process

### Manual Rollback

```bash
# List available releases
ls -lt /var/www/releases/

# Rollback to specific release
/root/rollback.sh 2  # Rollback to 2nd most recent release
```

### Emergency Rollback

```bash
# Quick rollback to previous release
cd /var/www/releases
PREV=$(ls -t | sed -n '2p')
ln -sfn /var/www/releases/$PREV /var/www/current
pm2 restart jarvis
```

## Monitoring

### Check Application Status

```bash
pm2 status jarvis
pm2 logs jarvis
pm2 monit
```

### Check Current Release

```bash
ls -l /var/www/current
# Shows: /var/www/current -> /var/www/releases/20260107213000
```

### View Available Releases

```bash
ls -lt /var/www/releases/
```

## Troubleshooting

### Deployment Fails

1. Check deployment script output
2. Verify git repository is accessible
3. Check disk space: `df -h`
4. Review PM2 logs: `pm2 logs jarvis --err`

### Application Won't Start

1. Check PM2 status: `pm2 status`
2. View error logs: `pm2 logs jarvis --err`
3. Verify environment variables: `cat /var/www/current/.env`
4. Check dependencies: `cd /var/www/current && npm list`

### Rollback Needed

1. Run rollback script: `/root/rollback.sh`
2. Select previous stable release
3. Verify application is running: `pm2 status jarvis`
4. Check logs for errors: `pm2 logs jarvis`

## Best Practices

1. **Always test in development** before deploying to production
2. **Monitor logs** during and after deployment
3. **Keep .env file updated** with necessary environment variables
4. **Verify CI passes** before manual deployment
5. **Have rollback plan ready** for each deployment
6. **Document any manual configuration changes**

## Server Details

- **Server**: DigitalOcean Droplet (jarvis-server)
- **IP**: 161.35.169.117
- **OS**: Ubuntu 24.04 LTS
- **Web Server**: Nginx (proxy to localhost:3000)
- **SSL**: Let's Encrypt (jarvissolutions.co.uk)
- **Process Manager**: PM2

## Related Documentation

- [CI/CD Workflow](.github/workflows/ci.yml)
- [Architecture Overview](ARCHITECTURE_OVERVIEW.md)
- [Admin Guide](ADMIN_GUIDE.md)
