// Load environment variables FIRST - before any other imports
import * as dotenv from 'dotenv';
import * as path from 'path';

// Explicitly configure dotenv with path resolution
// In production, __dirname will be 'dist/', so '../.env' resolves to project root
// This works for both compiled (dist/index.js) and source (src/index.ts) contexts
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Validate critical environment variables
const requiredEnvVars = ['SENTRY_DSN', 'OPENAI_API_KEY', 'DATABASE_URL'];
const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);

if (missingVars.length > 0) {
  console.warn(`⚠️  Missing environment variables: ${missingVars.join(', ')}`);
  console.warn('⚠️  Some features may not work correctly');
}

/**
 * Jarvis v4 - Entry Point
 *
 * Multi-Agent AI Assistant System with Enterprise Monitoring
 * 29 Specialized Agents
 *
 * ⚠️ All agents MUST read AI_RULES_MANDATORY.md before starting
 */

// CRITICAL: Initialize Sentry FIRST to capture boot-time errors
import { initSentry } from './sentry';
initSentry();

// Import monitoring and utilities
import logger from './utils/logger';
import { BankConnection } from '@prisma/client';
import { prisma } from './utils/prisma';
import { randomUUID } from 'crypto';
import {
  errorHandler,
  handleUncaughtException,
  handleUnhandledRejection,
} from './middleware/errorHandler';
import express from 'express';
import https from 'https';
import AudioStreamingService from './services/audioService';
import {
  createHealthRouter,
  setPrismaInstance,
  setCodeAnalysisAgent,
} from './health';
import { setErrorDetectionService } from './middleware/errorHandler';
import { DialogueAgent } from './agents/dialogue';
import { Orchestrator } from './orchestrator';
import { CodeAnalysisAgent } from './agents/code-analysis';
import { ErrorDetectionService } from './services/errorDetectionService';
// Set up global error handlers
handleUncaughtException();
handleUnhandledRejection();

async function verifyDatabaseSchema(): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1 FROM "KnowledgeBase" LIMIT 1`;
    await prisma.$queryRaw`SELECT 1 FROM "Conversation" LIMIT 1`;
    await prisma.$queryRaw`SELECT 1 FROM "Message" LIMIT 1`;
    logger.info('✅ Database schema check passed');
  } catch (error) {
    logger.error('Database schema check failed', { error });
    logger.warn('⚠️  Run `npm run db:push` to create tables');
  }
}

void verifyDatabaseSchema();

// Log startup
logger.info('🚀 Starting Jarvis v4...');
logger.warn('⚠️  AI Rules Enforcement: ACTIVE');
logger.info('📋 All agents must acknowledge AI_RULES_MANDATORY.md on startup');

// Initialize Express app
const app = express();
app.disable('x-powered-by');
const HTTPS_ENFORCE = (process.env.HTTPS_ENFORCE || 'true') !== 'false';
if (HTTPS_ENFORCE) {
  app.enable('trust proxy');
  app.use((req, res, next) => {
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
    if (proto !== 'https') {
      const host = req.headers.host;
      return res.redirect(301, `https://${host}${req.originalUrl}`);
    }
    return next();
  });
}
const PORT = Number(process.env.PORT) || 3000;
const TENANT_TOKEN = process.env.TENANT_TOKEN;

type AuthedRequest = express.Request & { authUserId?: string };

function bindAuthUser(
  req: AuthedRequest,
  res: express.Response,
  next: express.NextFunction,
) {
  const headerUser =
    (req.headers['x-user-id'] as string) || (req.headers['x-user'] as string);
  const bodyUser = (req.body?.userId as string) || undefined;
  const authUserId = headerUser || bodyUser;
  if (!authUserId) {
    return res.status(401).json({ error: 'Missing user identity' });
  }
  if (bodyUser && bodyUser !== authUserId) {
    return res.status(403).json({ error: 'User mismatch' });
  }
  req.authUserId = authUserId;
  return next();
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function requireTenantToken(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  if (!TENANT_TOKEN) {
    logger.warn('Tenant token not configured; denying protected endpoint');
    return res.status(503).json({ error: 'Tenant not configured' });
  }
  const provided =
    (req.headers['x-tenant-token'] as string) ||
    (req.headers['x-tenant'] as string) ||
    (req.query.tenantToken as string);
  if (provided !== TENANT_TOKEN) {
    return res.status(401).json({ error: 'Invalid tenant token' });
  }
  return next();
}

// Serve static files from public directory
import * as fs from 'fs';

// Resolve public directory path (works for both dev and production)
const publicPath = path.resolve(__dirname, '../public');
if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));
  logger.info('✅ Static files served from public directory');

  // Serve index.html for root route
  app.get('/', (_req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });
} else {
  logger.warn('⚠️  Public directory not found, static file serving disabled');
}

// Initialize Code Self-Healing System
let codeAnalysisAgent: CodeAnalysisAgent | null = null;
let errorDetectionService: ErrorDetectionService | null = null;

if (process.env.CODE_AUTO_FIX_ENABLED !== 'false') {
  try {
    errorDetectionService = new ErrorDetectionService();
    codeAnalysisAgent = new CodeAnalysisAgent(prisma);

    // Set error detection service for error handler
    setErrorDetectionService(errorDetectionService);

    // Set code analysis agent for health checks
    setCodeAnalysisAgent(codeAnalysisAgent);

    logger.info('🔍 Code Self-Healing System initialized');
  } catch (error) {
    logger.error('Failed to initialize Code Self-Healing System', { error });
    logger.warn('⚠️  Code auto-fix will be unavailable');
  }
}

// Register health check endpoints
// Set Prisma instance for health checks before creating router
setPrismaInstance(prisma);
app.use(createHealthRouter());
logger.info('✅ Health endpoints registered at /health and /health/ready');

// Import services for API endpoints
import VoiceAuthService from './services/voiceAuthService';
import BackupService from './services/backupService';
import { SpotifyAgent } from './agents/spotify';
import { FinanceAgent } from './agents/finance';
import { AlertAgent } from './agents/alert';
import { SystemControlAgent } from './agents/system-control';
import {
  MediaSafetyService,
  MediaSafetyDecision,
} from './services/mediaSafetyService';
import { mediaSafetyMiddleware } from './middleware/mediaSafety';
import { SunoService } from './services/sunoService';
import { MusicStorage } from './services/musicStorage';
import { MusicAgent } from './agents/music';
import { ImageService } from './services/imageService';
import { VideoService } from './services/videoService';
import { VideoEditService } from './services/videoEditService';
import { AssetStorage } from './services/assetStorage';
import { TrueLayerClient } from './services/truelayerClient';
import { FinanceService } from './services/financeService';
import { PaymentService } from './services/paymentService';
import { SystemActions } from './services/systemActions';
import { RemediationLibrary } from './services/remediationLibrary';
import { RTSPStreamService } from './services/rtspStreamService';
import { CameraService } from './services/cameraService';
import { ComputerVisionService } from './services/computerVisionService';
import { RecordingService } from './services/recordingService';
import { VisionAgent } from './agents/vision';

const voiceAuth = new VoiceAuthService(prisma);
const backupService = new BackupService(prisma);
const spotifyAgent = new SpotifyAgent(prisma);
const spotifyStateMap: Map<string, string> = new Map();
const truelayerStateMap: Map<
  string,
  { userId: string; codeVerifier?: string }
> = new Map();
const financeAgent = new FinanceAgent(prisma);
const alertAgent = new AlertAgent(prisma);
const truelayerClient = new TrueLayerClient();
const financeService = new FinanceService(prisma, truelayerClient);
const paymentService = new PaymentService(prisma, truelayerClient);
const systemControlAgent = new SystemControlAgent(prisma);
const systemActions = new SystemActions();
const remediation = new RemediationLibrary();
const mediaSafety = new MediaSafetyService();
const sunoService = new SunoService();
const musicStorage = new MusicStorage();
const musicAgent = new MusicAgent(sunoService, musicStorage);
const imageService = new ImageService();
const videoService = new VideoService();
const videoEditService = new VideoEditService();
const assetStorage = new AssetStorage();

// Vision System Services
const rtspStreamService = new RTSPStreamService();
const cameraService = new CameraService(prisma, rtspStreamService);
const cvService = new ComputerVisionService(prisma);
const recordingService = new RecordingService(prisma);
const visionAgent = new VisionAgent(
  prisma,
  cameraService,
  rtspStreamService,
  cvService,
  recordingService,
);
const dialogueAgent = new DialogueAgent(prisma);
const ORCHESTRATOR_ENABLED = process.env.ORCHESTRATOR_ENABLED !== 'false';
const orchestrator = ORCHESTRATOR_ENABLED ? new Orchestrator(prisma) : null;

function allowUnlessBlocked(
  decision: MediaSafetyDecision,
): MediaSafetyDecision {
  if (decision.action === 'block') {
    return decision;
  }
  if (decision.action === 'sanitize') {
    return {
      ...decision,
      action: 'allow' as const,
      reason: `${decision.reason} (coerced allow)`,
    };
  }
  return decision;
}

// Sentry test endpoint
app.get('/debug-sentry', function mainHandler(_req, _res) {
  throw new Error('My first Sentry error!');
});

// Music generation endpoints
app.post(
  '/api/music/generate',
  requireMediaEnabled,
  async (req: express.Request, res: express.Response) => {
    try {
      const { prompt, style, duration, stems, tags, userId } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: 'Missing prompt' });
      }

      const { track, provider } = await musicAgent.generate(userId, {
        prompt,
        style,
        duration,
        stems,
        tags,
      });

      // Safety gate on audio delivery
      const decision = mediaSafety.evaluate({
        source: 'generation',
        provider: 'stability',
        contentType: 'audio/mpeg',
        sizeBytes: undefined,
        userId,
        metadata: { trackId: track.id },
      });

      if (decision.action === 'block') {
        return res
          .status(403)
          .json({ error: 'Blocked by media safety', decision });
      }

      musicStorage.update(track.id, { safetyDecision: decision.action });

      res.json({
        success: true,
        track: {
          id: track.id,
          status: track.status,
          prompt: track.prompt,
          style: track.style,
          duration: track.duration,
          stemsRequested: track.stemsRequested,
          audioUrl: musicStorage.resolveUrl(track.audioUrl),
        },
        provider,
        decision,
      });
    } catch (error) {
      logger.error('Music generate failed', { error });
      res.status(500).json({ error: 'Music generation failed' });
    }
  },
);

const MEDIA_ENABLED = process.env.MEDIA_ENABLED !== 'false';
function requireMediaEnabled(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  if (!MEDIA_ENABLED) {
    return res.status(403).json({ error: 'Media endpoints disabled' });
  }
  return next();
}

// Media (images)
app.post(
  '/api/media/image/:action',
  requireMediaEnabled,
  async (req: express.Request, res: express.Response) => {
    try {
      const action = req.params.action as
        | 'generate'
        | 'variation'
        | 'inpaint'
        | 'outpaint'
        | 'upscale';
      const {
        prompt,
        style,
        seed,
        imageUrl,
        maskUrl,
        strength,
        width,
        height,
        userId,
      } = req.body;

      if (action === 'generate' && !prompt) {
        return res.status(400).json({ error: 'Missing prompt' });
      }
      if (action !== 'generate' && !imageUrl) {
        return res
          .status(400)
          .json({ error: 'Missing imageUrl for edit action' });
      }

      const decision = mediaSafety.evaluate({
        source: 'generation',
        provider: 'stability',
        contentType: 'image/png',
        userId,
      });
      if (decision.action === 'block') {
        return res
          .status(403)
          .json({ error: 'Blocked by media safety', decision });
      }

      let result;
      if (action === 'generate') {
        result = await imageService.generate({
          prompt,
          style,
          seed,
          width,
          height,
        });
      } else if (action === 'variation') {
        result = await imageService.variation({
          imageUrl,
          prompt,
          style,
          seed,
          strength,
        });
      } else if (action === 'inpaint') {
        result = await imageService.inpaint({
          imageUrl,
          maskUrl,
          prompt,
          style,
          strength,
        });
      } else if (action === 'outpaint') {
        result = await imageService.outpaint({
          imageUrl,
          prompt,
          style,
          strength,
        });
      } else if (action === 'upscale') {
        result = await imageService.upscale({
          imageUrl,
          prompt,
          style,
          strength,
        });
      } else {
        return res.status(400).json({ error: 'Unsupported action' });
      }

      const stored = assetStorage.create({
        type: 'image',
        prompt: prompt || '',
        style,
        seed,
        userId,
        status: 'succeeded',
        url: result.url,
        thumbnailUrl: result.thumbnailUrl,
        provider: result.provider,
        metadata: result.metadata,
        safetyDecision: decision.action,
      });

      res.json({
        success: true,
        asset: assetStorage.resolveDelivery(stored),
        decision,
      });
    } catch (error) {
      logger.error('Media image action failed', { error });
      res.status(500).json({ error: 'Image action failed' });
    }
  },
);

// Media (videos) - capped to 15s in service
app.post(
  '/api/media/video/generate',
  requireMediaEnabled,
  async (req: express.Request, res: express.Response) => {
    try {
      const { prompt, style, durationSeconds, userId } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: 'Missing prompt' });
      }

      const job = await videoService.generate({
        prompt,
        style,
        durationSeconds,
      });

      const decision = allowUnlessBlocked(
        mediaSafety.evaluate({
          source: 'generation',
          provider: 'stability',
          contentType: 'video/mp4',
          userId,
        }),
      );
      if (decision.action === 'block') {
        return res
          .status(403)
          .json({ error: 'Blocked by media safety', decision });
      }

      const stored = assetStorage.create({
        type: 'video',
        prompt,
        style,
        userId,
        status: job.status,
        url: job.videoUrl,
        thumbnailUrl: job.thumbnailUrl,
        provider: 'stability',
        metadata: job.metadata,
        safetyDecision: decision.action,
      });

      res.json({
        success: true,
        job: assetStorage.resolveDelivery(stored),
        decision,
      });
    } catch (error) {
      logger.error('Video generate failed', { error });
      res.status(500).json({ error: 'Video generation failed' });
    }
  },
);

app.post(
  '/api/media/video/edit',
  requireMediaEnabled,
  async (req: express.Request, res: express.Response) => {
    try {
      const {
        action,
        sources,
        startSeconds,
        endSeconds,
        overlayUrl,
        prompt,
        style,
        userId,
      } = req.body;
      if (!action) return res.status(400).json({ error: 'Missing action' });
      if (!sources || !Array.isArray(sources) || sources.length === 0) {
        return res.status(400).json({ error: 'Missing sources' });
      }

      const decision = allowUnlessBlocked(
        mediaSafety.evaluate({
          source: 'generation',
          provider: 'stability',
          contentType: 'video/mp4',
          userId,
        }),
      );
      if (decision.action === 'block') {
        return res
          .status(403)
          .json({ error: 'Blocked by media safety', decision });
      }

      const asset = await videoEditService.edit({
        action,
        sources,
        startSeconds,
        endSeconds,
        overlayUrl,
        prompt,
        style,
      });

      const stored = assetStorage.create({
        id: asset.id,
        type: 'video',
        prompt: prompt || '',
        style,
        userId,
        status: asset.status,
        url: asset.videoUrl,
        thumbnailUrl: asset.thumbnailUrl,
        provider: 'editor',
        metadata: asset.metadata,
        safetyDecision: decision.action,
        sourceAssetIds: sources,
        action,
      });

      res.json({
        success: true,
        job: assetStorage.resolveDelivery(stored),
        decision,
      });
    } catch (error) {
      logger.error('Video edit failed', { error });
      res.status(500).json({ error: 'Video edit failed' });
    }
  },
);

app.get(
  '/api/media/video/status/:id',
  requireMediaEnabled,
  async (req: express.Request, res: express.Response) => {
    try {
      const id = req.params.id;
      const status = await videoService.getStatus(id);
      const updated = assetStorage.update(id, {
        status: status.status,
        url: status.videoUrl,
        thumbnailUrl: status.thumbnailUrl,
        metadata: status.metadata,
      });
      if (!updated) {
        return res.status(404).json({ error: 'Video not found' });
      }
      res.json({ success: true, job: assetStorage.resolveDelivery(updated) });
    } catch (error) {
      logger.error('Video status failed', { error });
      res.status(500).json({ error: 'Status check failed' });
    }
  },
);

app.get(
  '/api/media/video/list',
  requireMediaEnabled,
  (_req: express.Request, res: express.Response) => {
    const assets = assetStorage.list().filter((a) => a.type === 'video');
    res.json({ videos: assets });
  },
);

app.get(
  '/api/media/assets',
  requireMediaEnabled,
  (_req: express.Request, res: express.Response) => {
    const assets = assetStorage.list();
    res.json({ assets });
  },
);

app.get(
  '/api/media/admin/summary',
  requireMediaEnabled,
  (_req: express.Request, res: express.Response) => {
    const assets = assetStorage.list(50);
    const safety = mediaSafety.getRecent(50);
    res.json({ assets, safety });
  },
);

app.get(
  '/api/music/status/:id',
  requireMediaEnabled,
  async (req: express.Request, res: express.Response) => {
    try {
      const id = req.params.id;
      const updated = await musicAgent.refreshStatus(id);
      const track = updated || musicStorage.get(id);
      if (!track) {
        return res.status(404).json({ error: 'Track not found' });
      }
      res.json({
        success: true,
        track: {
          ...track,
          audioUrl: musicStorage.resolveUrl(track.audioUrl),
        },
      });
    } catch (error) {
      logger.error('Music status failed', { error });
      res.status(500).json({ error: 'Status check failed' });
    }
  },
);

app.get(
  '/api/music/list',
  requireMediaEnabled,
  (_req: express.Request, res: express.Response) => {
    const tracks = musicStorage.list().map((t) => ({
      ...t,
      audioUrl: musicStorage.resolveUrl(t.audioUrl),
    }));
    res.json({ tracks });
  },
);

app.get(
  '/api/music/stems/:id',
  requireMediaEnabled,
  mediaSafetyMiddleware(mediaSafety),
  async (req: express.Request, res: express.Response) => {
    try {
      const id = req.params.id;
      const track = musicStorage.get(id);
      if (!track) {
        return res.status(404).json({ error: 'Track not found' });
      }
      const stems = track.stems || (await sunoService.getStems(id));
      musicStorage.update(id, { stems });
      res.json({ stems });
    } catch (error) {
      logger.error('Music stems failed', { error });
      res.status(500).json({ error: 'Stems fetch failed' });
    }
  },
);

// Voice enrollment endpoint (tenant-gated)
app.post(
  '/api/voice/enroll',
  requireTenantToken,
  bindAuthUser,
  async (req: AuthedRequest, res: express.Response) => {
    try {
      const { audioSamples, userId: bodyUserId } = req.body;
      const userId = req.authUserId;

      if (!userId || !audioSamples || !Array.isArray(audioSamples)) {
        return res.status(400).json({
          error: 'Missing required fields: userId and audioSamples (array)',
        });
      }
      if (bodyUserId && bodyUserId !== userId) {
        return res.status(403).json({ error: 'User mismatch' });
      }

      // Convert base64 audio samples to buffers
      const audioBuffers = audioSamples.map((sample: string) =>
        Buffer.from(sample, 'base64'),
      );

      await voiceAuth.enrollVoiceprint(userId, audioBuffers);

      res.json({
        success: true,
        message: 'Voiceprint enrolled successfully',
      });
    } catch (error) {
      logger.error('Voice enrollment failed', { error });
      res.status(500).json({
        error: 'Voice enrollment failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
);

// Dialogue endpoints (core conversation ingress)
app.post(
  '/api/dialogue/message',
  bindAuthUser,
  async (req: AuthedRequest, res: express.Response) => {
    try {
      const { input, sessionId, conversationId, userId: bodyUserId } = req.body;
      const userId = req.authUserId;
      if (!input || !userId) {
        return res.status(400).json({ error: 'Missing input or userId' });
      }
      if (bodyUserId && bodyUserId !== userId) {
        return res.status(403).json({ error: 'User mismatch' });
      }
      const sid = sessionId || randomUUID();
      const response = await dialogueAgent.generateResponse(
        input,
        sid,
        userId,
        conversationId,
      );
      const resolvedConversationId =
        conversationId ||
        dialogueAgent['sessionToConversation']?.get?.(sid) ||
        null;
      res.json({
        success: true,
        response,
        sessionId: sid,
        conversationId: resolvedConversationId,
      });
    } catch (error) {
      logger.error('Dialogue message failed', { error });
      res.status(500).json({ error: 'Dialogue failed' });
    }
  },
);

app.get(
  '/api/dialogue/conversations/:userId',
  bindAuthUser,
  async (req: AuthedRequest, res: express.Response) => {
    try {
      const { userId } = req.params;
      if (req.authUserId && req.authUserId !== userId) {
        return res.status(403).json({ error: 'User mismatch' });
      }
      const conversations = await dialogueAgent.listConversations(userId);
      res.json({ conversations });
    } catch (error) {
      logger.error('List conversations failed', { error });
      res.status(500).json({ error: 'Failed to list conversations' });
    }
  },
);

// Orchestrator bridge (task routing via HTTP)
if (ORCHESTRATOR_ENABLED && orchestrator) {
  app.post(
    '/api/orchestrator/message',
    async (req: express.Request, res: express.Response) => {
      try {
        const message = req.body || {};
        const response = await orchestrator.routeMessage(message);
        res.json(response);
      } catch (error) {
        logger.error('Orchestrator routing failed', { error });
        res.status(500).json({ error: 'Orchestrator failed' });
      }
    },
  );
}

// Voice verification status endpoint (tenant-gated)
app.get(
  '/api/voice/status/:userId',
  requireTenantToken,
  async (req: express.Request, res: express.Response) => {
    try {
      const { userId } = req.params;
      const hasVoiceprint = await voiceAuth.hasVoiceprint(userId);

      res.json({
        hasVoiceprint,
        userId,
      });
    } catch (error) {
      logger.error('Failed to check voice status', { error });
      res.status(500).json({
        error: 'Failed to check voice status',
      });
    }
  },
);

// Spotify OAuth endpoints
app.get('/api/spotify/auth', (req: express.Request, res: express.Response) => {
  const userId = (req.query.userId as string) || (req.query.user_id as string);
  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' });
  }

  const state = randomUUID();
  spotifyStateMap.set(state, userId);

  const url = spotifyAgent.getAuthorizationUrl(userId, state);
  return res.json({ url, state });
});

app.get(
  '/api/spotify/callback',
  async (req: express.Request, res: express.Response) => {
    try {
      const code = req.query.code as string;
      const state = req.query.state as string;
      if (!code || !state) {
        return res.status(400).send('Missing code or state');
      }

      const userId = spotifyStateMap.get(state);
      if (!userId) {
        return res.status(400).send('Invalid state');
      }

      await spotifyAgent.exchangeCodeForToken(code, userId);
      spotifyStateMap.delete(state);
      return res.send(
        'Spotify authorization successful. You can close this window.',
      );
    } catch (error) {
      logger.error('Spotify callback failed', { error });
      return res.status(500).send('Spotify authorization failed');
    }
  },
);

app.post(
  '/api/spotify/refresh',
  async (req: express.Request, res: express.Response) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ error: 'Missing userId' });
      }

      const token = await spotifyAgent.refreshAccessToken(userId);
      if (!token) {
        return res.status(400).json({ error: 'Refresh failed' });
      }

      return res.json({
        success: true,
        expiresAt: token.expiresAt,
        scope: token.scope,
        tokenType: token.tokenType,
      });
    } catch (error) {
      logger.error('Spotify token refresh failed', { error });
      return res.status(500).json({ error: 'Spotify refresh failed' });
    }
  },
);

// Media safety endpoints
app.post(
  '/api/media/safety/evaluate',
  requireMediaEnabled,
  (req: express.Request, res: express.Response) => {
    try {
      const decision = mediaSafety.evaluate({
        source: (req.body.source as 'generation' | 'upload') || 'upload',
        provider: (req.body.provider as 'stability') || 'stability',
        safetySignals: req.body.stabilitySafety || req.body.safetySignals,
        contentType: req.body.contentType,
        sizeBytes: req.body.sizeBytes,
        userId: req.body.userId,
        agentId: req.body.agentId,
        metadata: req.body.metadata,
      });

      res.json({ success: decision.action !== 'block', decision });
    } catch (error) {
      logger.error('Media safety evaluation failed', { error });
      res.status(500).json({ error: 'Media safety evaluation failed' });
    }
  },
);

app.get(
  '/api/media/safety/events',
  requireMediaEnabled,
  (_req: express.Request, res: express.Response) => {
    const events = mediaSafety.getRecent();
    res.json({ events, alerts: mediaSafety.hasRecentAlerts() });
  },
);

// Example protected upload endpoint (no file handling, only safety enforcement)
app.post(
  '/api/media/upload',
  requireMediaEnabled,
  mediaSafetyMiddleware(mediaSafety),
  (req: express.Request, res: express.Response) => {
    res.json({
      success: true,
      sanitized: req.body.__sanitized === true,
      decision: res.locals.mediaSafetyDecision,
    });
  },
);

// Backup endpoints

app.post(
  '/api/backup/create',
  async (_req: express.Request, res: express.Response) => {
    try {
      const backupPath = await backupService.createBackup();
      res.json({
        success: true,
        path: backupPath,
        message: 'Backup created successfully',
      });
    } catch (error) {
      logger.error('Backup creation failed', { error });
      res.status(500).json({
        error: 'Backup creation failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
);

// TrueLayer auth start
app.get(
  '/api/truelayer/auth',
  (_req: express.Request, res: express.Response) => {
    const userId = _req.query.userId as string;
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    const { verifier, challenge } = truelayerClient.generatePKCE();
    const state = randomUUID();
    truelayerStateMap.set(state, { userId, codeVerifier: verifier });
    const url = truelayerClient.buildAuthorizeUrl(state, undefined, challenge);
    return res.json({ url, state });
  },
);

// TrueLayer auth callback
app.get(
  '/api/truelayer/callback',
  async (req: express.Request, res: express.Response) => {
    try {
      const code = req.query.code as string;
      const state = req.query.state as string;
      if (!code || !state) {
        return res.status(400).send('Missing code or state');
      }
      const entry = truelayerStateMap.get(state);
      if (!entry) {
        return res.status(400).send('Invalid state');
      }

      const token = await truelayerClient.exchangeCode(
        code,
        entry.codeVerifier,
      );
      const expiresAt = new Date(Date.now() + token.expires_in * 1000);

      await prisma.bankConnection.create({
        data: {
          userId: entry.userId,
          provider: 'truelayer',
          accessToken: token.access_token,
          refreshToken: token.refresh_token,
          scope: token.scope,
          expiresAt,
        },
      });

      truelayerStateMap.delete(state);
      return res.send(
        'TrueLayer authorization successful. You can close this window.',
      );
    } catch (error) {
      logger.error('TrueLayer callback failed', { error });
      return res.status(500).send('TrueLayer authorization failed');
    }
  },
);

async function ensureFreshTrueLayerToken(
  connectionId: string,
): Promise<{ connection: BankConnection; accessToken: string }> {
  const connection = await prisma.bankConnection.findUnique({
    where: { id: connectionId },
  });
  if (!connection) {
    throw new Error('Bank connection not found');
  }

  let accessToken = connection.accessToken;
  if (connection.expiresAt.getTime() - Date.now() < 60_000) {
    const refreshed = await truelayerClient.refreshToken(
      connection.refreshToken,
    );
    accessToken = refreshed.access_token;
    await prisma.bankConnection.update({
      where: { id: connectionId },
      data: {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token || connection.refreshToken,
        scope: refreshed.scope,
        expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      },
    });
  }

  return { connection, accessToken };
}

// TrueLayer manual sync
app.post(
  '/api/truelayer/sync',
  async (req: express.Request, res: express.Response) => {
    try {
      const { bankConnectionId, from, to } = req.body;
      if (!bankConnectionId) {
        return res.status(400).json({ error: 'Missing bankConnectionId' });
      }

      const { connection, accessToken } =
        await ensureFreshTrueLayerToken(bankConnectionId);
      await financeService.syncTrueLayer(
        connection.userId,
        connection,
        accessToken,
        { from, to },
      );
      res.json({ success: true });
    } catch (error) {
      logger.error('TrueLayer sync failed', { error });
      res.status(500).json({ error: 'Sync failed' });
    }
  },
);

// TrueLayer payment create
app.post(
  '/api/truelayer/payments',
  async (req: express.Request, res: express.Response) => {
    try {
      const { bankConnectionId, amount, currency, reference, beneficiary } =
        req.body;
      if (!bankConnectionId || !amount || !currency || !beneficiary?.name) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const { connection, accessToken } =
        await ensureFreshTrueLayerToken(bankConnectionId);
      const payment = await paymentService.createPayment(
        connection.userId,
        connection,
        accessToken,
        amount,
        currency,
        reference || 'Jarvis payment',
        beneficiary,
      );
      res.json({ success: true, payment });
    } catch (error) {
      logger.error('TrueLayer payment creation failed', { error });
      res.status(500).json({ error: 'Payment creation failed' });
    }
  },
);

// TrueLayer payment status
app.get(
  '/api/truelayer/payments/:id',
  async (req: express.Request, res: express.Response) => {
    try {
      const paymentId = req.params.id;
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
      });
      if (!payment) {
        return res.status(404).json({ error: 'Payment not found' });
      }
      const { accessToken } = await ensureFreshTrueLayerToken(
        payment.bankConnectionId,
      );
      const updated = await paymentService.updatePaymentStatus(
        paymentId,
        accessToken,
      );
      res.json({ payment: updated || payment });
    } catch (error) {
      logger.error('TrueLayer payment status failed', { error });
      res.status(500).json({ error: 'Payment status failed' });
    }
  },
);

// System control routes (guarded)
const SYSTEM_ENABLED = process.env.SYSTEM_CONTROL_ENABLED === 'true';
const SYSTEM_TOKEN = process.env.SYSTEM_CONTROL_AUTH_TOKEN || '';

function requireSystemEnabled(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  if (!SYSTEM_ENABLED) {
    return res.status(403).json({ error: 'System control disabled' });
  }
  const token = req.headers['x-system-token'];
  if (!token || token !== SYSTEM_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
}

app.post(
  '/api/system/exec',
  requireSystemEnabled,
  async (req: express.Request, res: express.Response) => {
    try {
      const { cmd, shell, timeoutMs, dryRun } = req.body;
      if (!cmd) {
        return res.status(400).json({ error: 'Missing cmd' });
      }
      if (
        typeof cmd !== 'string' ||
        /[;&|`><]/.test(cmd) ||
        /\r|\n/.test(cmd)
      ) {
        return res.status(400).json({ error: 'Invalid command' });
      }
      const result = await systemControlAgent.exec({
        cmd,
        shell,
        timeoutMs,
        dryRun,
      });
      res.json(result);
    } catch (error) {
      logger.error('System exec failed', { error });
      res.status(500).json({ error: 'System exec failed' });
    }
  },
);

app.post(
  '/api/system/fix/:action',
  requireSystemEnabled,
  async (req: express.Request, res: express.Response) => {
    try {
      const action = req.params.action as Parameters<
        RemediationLibrary['run']
      >[0];
      const message = await systemControlAgent.fix({ action });
      res.json({ success: true, message });
    } catch (error) {
      logger.error('System fix failed', { error });
      res.status(500).json({ error: 'System fix failed' });
    }
  },
);

app.post(
  '/api/system/registry',
  requireSystemEnabled,
  async (req: express.Request, res: express.Response) => {
    try {
      const { path: regPath, name, value, mode } = req.body;
      if (!regPath || !mode) {
        return res.status(400).json({ error: 'Missing registry path or mode' });
      }
      const result = await systemControlAgent.registry({
        path: regPath,
        name,
        value,
        mode,
      });
      res.json({ success: true, result });
    } catch (error) {
      logger.error('Registry operation failed', { error });
      res.status(500).json({ error: 'Registry operation failed' });
    }
  },
);

app.post(
  '/api/system/service/restart',
  requireSystemEnabled,
  async (req: express.Request, res: express.Response) => {
    try {
      const { name } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Missing service name' });
      }
      await systemControlAgent.restartService(name);
      res.json({ success: true });
    } catch (error) {
      logger.error('Service restart failed', { error });
      res.status(500).json({ error: 'Service restart failed' });
    }
  },
);

app.get(
  '/api/system/processes',
  requireSystemEnabled,
  async (_req: express.Request, res: express.Response) => {
    try {
      const result = await systemControlAgent.inspectProcesses();
      res.json(result);
    } catch (error) {
      logger.error('Process list failed', { error });
      res.status(500).json({ error: 'Process list failed' });
    }
  },
);

// Vision System Routes
if (process.env.VISION_ENABLED !== 'false') {
  // Camera Management
  app.post(
    '/api/vision/cameras',
    async (req: express.Request, res: express.Response) => {
      try {
        const {
          name,
          protocol,
          ipAddress,
          rtspUrl,
          username,
          password,
          model,
        } = req.body;
        if (!name || !protocol || !password) {
          return res.status(400).json({ error: 'Missing required fields' });
        }
        if (protocol === 'onvif' && !ipAddress) {
          return res.status(400).json({ error: 'ONVIF requires ipAddress' });
        }
        if (protocol === 'rtsp' && !rtspUrl) {
          return res.status(400).json({ error: 'RTSP requires rtspUrl' });
        }
        const id = await visionAgent.addCamera({
          name,
          protocol,
          ipAddress,
          rtspUrl,
          username,
          password,
          model,
        });
        res.json({ success: true, id });
      } catch (error) {
        logger.error('Add camera failed', { error });
        res.status(500).json({ error: 'Add camera failed' });
      }
    },
  );

  app.get(
    '/api/vision/cameras',
    async (req: express.Request, res: express.Response) => {
      try {
        const activeOnly = req.query.activeOnly === 'true';
        const cameras = await visionAgent.listCameras(activeOnly);
        res.json({ cameras });
      } catch (error) {
        logger.error('List cameras failed', { error });
        res.status(500).json({ error: 'List cameras failed' });
      }
    },
  );

  app.get(
    '/api/vision/cameras/:id',
    async (req: express.Request, res: express.Response) => {
      try {
        const camera = await visionAgent.getCamera(req.params.id);
        if (!camera) return res.status(404).json({ error: 'Camera not found' });
        res.json({ camera });
      } catch (error) {
        logger.error('Get camera failed', { error });
        res.status(500).json({ error: 'Get camera failed' });
      }
    },
  );

  app.put(
    '/api/vision/cameras/:id',
    async (req: express.Request, res: express.Response) => {
      try {
        const updates = req.body;
        await cameraService.updateCamera(req.params.id, updates);
        res.json({ success: true });
      } catch (error) {
        logger.error('Update camera failed', { error });
        res.status(500).json({ error: 'Update camera failed' });
      }
    },
  );

  app.delete(
    '/api/vision/cameras/:id',
    async (req: express.Request, res: express.Response) => {
      try {
        await visionAgent.disconnectCamera(req.params.id);
        await cameraService.deleteCamera(req.params.id);
        res.json({ success: true });
      } catch (error) {
        logger.error('Delete camera failed', { error });
        res.status(500).json({ error: 'Delete camera failed' });
      }
    },
  );

  app.post(
    '/api/vision/cameras/:id/connect',
    async (req: express.Request, res: express.Response) => {
      try {
        await visionAgent.connectCamera(req.params.id);
        res.json({ success: true });
      } catch (error) {
        logger.error('Connect camera failed', { error });
        res.status(500).json({ error: 'Connect camera failed' });
      }
    },
  );

  app.post(
    '/api/vision/cameras/:id/disconnect',
    async (req: express.Request, res: express.Response) => {
      try {
        await visionAgent.disconnectCamera(req.params.id);
        res.json({ success: true });
      } catch (error) {
        logger.error('Disconnect camera failed', { error });
        res.status(500).json({ error: 'Disconnect camera failed' });
      }
    },
  );

  app.post(
    '/api/vision/cameras/discover',
    async (req: express.Request, res: express.Response) => {
      try {
        const timeout = req.body.timeout ? Number(req.body.timeout) : undefined;
        const cameras = await visionAgent.discoverCameras(timeout);
        res.json({ cameras });
      } catch (error) {
        logger.error('Camera discovery failed', { error });
        res.status(500).json({ error: 'Camera discovery failed' });
      }
    },
  );

  // Streaming
  app.post(
    '/api/vision/streams/:cameraId/start',
    async (req: express.Request, res: express.Response) => {
      try {
        const stream = await visionAgent.startStream(req.params.cameraId);
        res.json({ success: true, stream });
      } catch (error) {
        logger.error('Start stream failed', { error });
        res.status(500).json({ error: 'Start stream failed' });
      }
    },
  );

  app.post(
    '/api/vision/streams/:cameraId/stop',
    async (req: express.Request, res: express.Response) => {
      try {
        await visionAgent.stopStream(req.params.cameraId);
        res.json({ success: true });
      } catch (error) {
        logger.error('Stop stream failed', { error });
        res.status(500).json({ error: 'Stop stream failed' });
      }
    },
  );

  app.get(
    '/api/vision/streams/:cameraId',
    async (req: express.Request, res: express.Response) => {
      try {
        const stream = rtspStreamService.getStream(req.params.cameraId);
        if (!stream) return res.status(404).json({ error: 'Stream not found' });
        res.json({ stream });
      } catch (error) {
        logger.error('Get stream failed', { error });
        res.status(500).json({ error: 'Get stream failed' });
      }
    },
  );

  app.get(
    '/api/vision/streams',
    async (_req: express.Request, res: express.Response) => {
      try {
        const streams = rtspStreamService.listStreams();
        res.json({ streams });
      } catch (error) {
        logger.error('List streams failed', { error });
        res.status(500).json({ error: 'List streams failed' });
      }
    },
  );

  // PTZ Control
  app.post(
    '/api/vision/cameras/:id/ptz/move',
    async (req: express.Request, res: express.Response) => {
      try {
        const { pan, tilt, zoom, speed } = req.body;
        await visionAgent.movePTZ(req.params.id, { pan, tilt, zoom, speed });
        res.json({ success: true });
      } catch (error) {
        logger.error('PTZ move failed', { error });
        res.status(500).json({ error: 'PTZ move failed' });
      }
    },
  );

  app.post(
    '/api/vision/cameras/:id/ptz/stop',
    async (req: express.Request, res: express.Response) => {
      try {
        await visionAgent.stopPTZ(req.params.id);
        res.json({ success: true });
      } catch (error) {
        logger.error('PTZ stop failed', { error });
        res.status(500).json({ error: 'PTZ stop failed' });
      }
    },
  );

  app.get(
    '/api/vision/cameras/:id/ptz/status',
    async (req: express.Request, res: express.Response) => {
      try {
        const position = await visionAgent.getPTZPosition(req.params.id);
        res.json({ position });
      } catch (error) {
        logger.error('Get PTZ status failed', { error });
        res.status(500).json({ error: 'Get PTZ status failed' });
      }
    },
  );

  app.post(
    '/api/vision/cameras/:id/ptz/preset',
    async (req: express.Request, res: express.Response) => {
      try {
        const { token, name, action } = req.body;
        if (action === 'set') {
          await visionAgent.setPreset(req.params.id, token, name);
        } else if (action === 'goto') {
          await visionAgent.gotoPreset(req.params.id, token);
        } else {
          return res.status(400).json({ error: 'Invalid action' });
        }
        res.json({ success: true });
      } catch (error) {
        logger.error('PTZ preset failed', { error });
        res.status(500).json({ error: 'PTZ preset failed' });
      }
    },
  );

  app.get(
    '/api/vision/cameras/:id/ptz/presets',
    async (req: express.Request, res: express.Response) => {
      try {
        const presets = await visionAgent.getPresets(req.params.id);
        res.json({ presets });
      } catch (error) {
        logger.error('Get presets failed', { error });
        res.status(500).json({ error: 'Get presets failed' });
      }
    },
  );

  // Object Detection
  app.post(
    '/api/vision/detect/:cameraId',
    async (req: express.Request, res: express.Response) => {
      try {
        const { frameData, frameUrl, confidenceThreshold } = req.body;
        const detections = await visionAgent.detectObjects(
          req.params.cameraId,
          {
            frameData: frameData ? Buffer.from(frameData, 'base64') : undefined,
            frameUrl,
            confidenceThreshold,
          },
        );
        res.json({ success: true, detections });
      } catch (error) {
        logger.error('Detection failed', { error });
        res.status(500).json({ error: 'Detection failed' });
      }
    },
  );

  app.get(
    '/api/vision/detections',
    async (req: express.Request, res: express.Response) => {
      try {
        const filters: any = {};
        if (req.query.cameraId) filters.cameraId = req.query.cameraId as string;
        if (req.query.objectType)
          filters.objectType = req.query.objectType as string;
        if (req.query.startTime)
          filters.startTime = new Date(req.query.startTime as string);
        if (req.query.endTime)
          filters.endTime = new Date(req.query.endTime as string);
        if (req.query.minConfidence)
          filters.minConfidence = Number(req.query.minConfidence);
        if (req.query.limit) filters.limit = Number(req.query.limit);
        const detections = await visionAgent.queryDetections(filters);
        res.json({ detections });
      } catch (error) {
        logger.error('Query detections failed', { error });
        res.status(500).json({ error: 'Query detections failed' });
      }
    },
  );

  app.get(
    '/api/vision/detections/:id',
    async (req: express.Request, res: express.Response) => {
      try {
        const detection = await prisma.detection.findUnique({
          where: { id: req.params.id },
          include: { camera: { select: { id: true, name: true } } },
        });
        if (!detection)
          return res.status(404).json({ error: 'Detection not found' });
        res.json({ detection });
      } catch (error) {
        logger.error('Get detection failed', { error });
        res.status(500).json({ error: 'Get detection failed' });
      }
    },
  );

  // Recording
  app.post(
    '/api/vision/recordings/start',
    async (req: express.Request, res: express.Response) => {
      try {
        const { cameraIds, duration, startTime } = req.body;
        if (!cameraIds || !Array.isArray(cameraIds) || cameraIds.length === 0) {
          return res.status(400).json({ error: 'Missing cameraIds' });
        }
        const ids = await visionAgent.startRecording({
          cameraIds,
          duration,
          startTime: startTime ? new Date(startTime) : undefined,
        });
        res.json({ success: true, recordingIds: ids });
      } catch (error) {
        logger.error('Start recording failed', { error });
        res.status(500).json({ error: 'Start recording failed' });
      }
    },
  );

  app.post(
    '/api/vision/recordings/:id/stop',
    async (req: express.Request, res: express.Response) => {
      try {
        await visionAgent.stopRecording(req.params.id);
        res.json({ success: true });
      } catch (error) {
        logger.error('Stop recording failed', { error });
        res.status(500).json({ error: 'Stop recording failed' });
      }
    },
  );

  app.get(
    '/api/vision/recordings',
    async (req: express.Request, res: express.Response) => {
      try {
        const filters: any = {};
        if (req.query.cameraId) filters.cameraId = req.query.cameraId as string;
        if (req.query.status) filters.status = req.query.status as string;
        if (req.query.startTime)
          filters.startTime = new Date(req.query.startTime as string);
        if (req.query.endTime)
          filters.endTime = new Date(req.query.endTime as string);
        if (req.query.limit) filters.limit = Number(req.query.limit);
        const recordings = await visionAgent.listRecordings(filters);
        res.json({ recordings });
      } catch (error) {
        logger.error('List recordings failed', { error });
        res.status(500).json({ error: 'List recordings failed' });
      }
    },
  );

  app.get(
    '/api/vision/recordings/:id/playback',
    async (req: express.Request, res: express.Response) => {
      try {
        const url = await visionAgent.getPlaybackUrl(req.params.id);
        if (!url)
          return res
            .status(404)
            .json({ error: 'Recording not found or not available' });
        res.json({ playbackUrl: url });
      } catch (error) {
        logger.error('Get playback URL failed', { error });
        res.status(500).json({ error: 'Get playback URL failed' });
      }
    },
  );

  app.get(
    '/api/vision/recordings/:id/download',
    async (req: express.Request, res: express.Response) => {
      try {
        const recording = await recordingService.getRecording(req.params.id);
        const safeBasePath = path.resolve(
          process.env.RECORDING_STORAGE_PATH || './recordings',
        );
        const safePath = recording ? path.resolve(recording.filePath) : '';
        if (
          !recording ||
          !safePath.startsWith(`${safeBasePath}${path.sep}`) ||
          !fs.existsSync(safePath)
        ) {
          return res.status(404).json({ error: 'Recording file not found' });
        }
        const maxMb = Number(process.env.RECORDING_DOWNLOAD_MAX_MB || 500);
        const stats = fs.statSync(safePath);
        const sizeMb = stats.size / (1024 * 1024);
        if (sizeMb > maxMb) {
          return res
            .status(413)
            .json({ error: 'Recording too large to download' });
        }
        res.download(safePath);
      } catch (error) {
        logger.error('Download recording failed', { error });
        res.status(500).json({ error: 'Download recording failed' });
      }
    },
  );
}

app.get(
  '/api/backup/list',
  async (_req: express.Request, res: express.Response) => {
    try {
      const backups = await backupService.listBackups();
      res.json({
        backups,
        count: backups.length,
      });
    } catch (error) {
      logger.error('Failed to list backups', { error });
      res.status(500).json({
        error: 'Failed to list backups',
      });
    }
  },
);

// Initialize Self-Healing Agent
import { SelfHealingAgent } from './agents/self-healing';
// Initialize Watchdog Agent
import { WatchdogAgent } from './agents/watchdog';
// Initialize Mutual Monitoring
import { MutualMonitoringService } from './services/mutualMonitoringService';
import { AgentManagerService } from './services/agentManagerService';
import { TaskQueueService } from './services/taskQueueService';
import { ChildFailureHandler } from './services/childFailureHandler';
import { AgentCommunicationService } from './services/agentCommunicationService';
import { ErrorDetectionService } from './services/errorDetectionService';
import { AutoFixService } from './services/autoFixService';

// TODO: Initialize orchestrator and all agents
logger.info('✅ Jarvis v4 foundation ready');
logger.info('🔄 Agent implementation coming in subsequent PRs');

// Error handling middleware (must be last)
app.use(errorHandler);

// Create HTTP/HTTPS server for Socket.IO integration
function createAppServer(): import('https').Server {
  const keyPath = process.env.HTTPS_KEY_PATH;
  const certPath = process.env.HTTPS_CERT_PATH;
  if (!keyPath || !certPath) {
    throw new Error(
      'HTTPS_KEY_PATH and HTTPS_CERT_PATH are required for HTTPS-only mode',
    );
  }
  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    throw new Error('HTTPS cert or key path not found');
  }
  const key = fs.readFileSync(keyPath);
  const cert = fs.readFileSync(certPath);
  logger.info('Starting HTTPS server (strict HTTPS-only mode)');
  return https.createServer({ key, cert }, app);
}

const server = createAppServer();

// Handle server errors
server.on('error', (error: Error) => {
  logger.error('Server error:', { error });
  process.exit(1);
});

// Start server first - health endpoints are already registered
// Note: Omitting hostname defaults to listening on all interfaces (0.0.0.0)
server.listen(PORT, () => {
  logger.info(`🎉 Jarvis v4 server listening on port ${PORT}`);
  logger.info(`📊 Health check: http://localhost:${PORT}/health`);

  // Initialize Audio Streaming Service after server is listening
  try {
    new AudioStreamingService(server, prisma);
    logger.info('🎤 Audio Streaming Service initialized');
    logger.info(`🚀 Ready for voice agent implementation`);
  } catch (error) {
    logger.error('Failed to initialize Audio Streaming Service', { error });
    logger.warn('⚠️  Audio streaming will be unavailable');
  }

  // Initialize Code Analysis Agent (start scanning)
  if (codeAnalysisAgent) {
    try {
      codeAnalysisAgent.startScanning();
      logger.info('🔍 Code Analysis Agent started scanning');
    } catch (error) {
      logger.error('Failed to start code analysis scanning', { error });
    }
  }

  const runEmbeddedSelfHealing = process.env.EMBEDDED_SELF_HEALING === 'true';
  const runEmbeddedWatchdog = process.env.EMBEDDED_WATCHDOG === 'true';

  // Initialize Self-Healing Agent (only when explicitly enabled)
  if (runEmbeddedSelfHealing) {
    try {
      const selfHealingAgent = new SelfHealingAgent();
      void selfHealingAgent.startMonitoring();
      logger.info(
        '🔧 Self-Healing Agent initialized and monitoring (embedded)',
      );

      if (errorDetectionService && codeAnalysisAgent) {
        logger.info('🔗 Code error handling integrated with self-healing');
      }
    } catch (error) {
      logger.error('Failed to initialize Self-Healing Agent', { error });
      logger.warn('⚠️  Self-healing will be unavailable in embedded mode');
    }
  } else {
    logger.info(
      'Skipping embedded Self-Healing Agent (managed by standalone process)',
    );
  }

  // Initialize Watchdog Agent (only when explicitly enabled)
  if (runEmbeddedWatchdog) {
    try {
      const watchdogAgent = new WatchdogAgent(prisma);
      void watchdogAgent.startMonitoring(30000);
      logger.info('🐕 Watchdog Agent initialized and monitoring (embedded)');
    } catch (error) {
      logger.error('Failed to initialize Watchdog Agent', { error });
      logger.warn(
        '⚠️  Watchdog monitoring will be unavailable in embedded mode',
      );
    }
  } else {
    logger.info(
      'Skipping embedded Watchdog Agent (managed by standalone process)',
    );
  }

  // Initialize Mutual Monitoring Service
  try {
    const agentManager = new AgentManagerService(prisma);
    const taskQueue = new TaskQueueService(prisma, agentManager);
    const failureHandler = new ChildFailureHandler(
      prisma,
      agentManager,
      taskQueue,
    );
    const communication = new AgentCommunicationService();
    const mutualMonitoring = new MutualMonitoringService(
      prisma,
      agentManager,
      failureHandler,
      communication,
    );

    // Start mutual monitoring
    mutualMonitoring.startMonitoring(30000);

    // Auto-setup mutual monitoring for existing agents
    void mutualMonitoring.autoSetupMutualMonitoring();

    logger.info('🔄 Mutual Monitoring Service initialized');
  } catch (error) {
    logger.error('Failed to initialize Mutual Monitoring Service', { error });
    logger.warn('⚠️  Mutual monitoring will be unavailable');
  }
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('👋 SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('👋 SIGINT signal received: closing HTTP server');
  process.exit(0);
});
