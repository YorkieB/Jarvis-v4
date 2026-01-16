import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import logger from '../utils/logger';

export interface StreamConfig {
  cameraId: string;
  rtspUrl: string;
  port?: number;
}

export interface ActiveStream {
  cameraId: string;
  wsUrl: string;
  viewers: number;
  status: 'active' | 'inactive' | 'error';
}

export class RTSPStreamService {
  private streams: Map<string, ActiveStream> = new Map();
  private wsServers: Map<string, WebSocketServer> = new Map();
  private httpServers: Map<string, ReturnType<typeof createServer>> = new Map();
  private basePort: number;

  constructor() {
    this.basePort = Number(process.env.RTSP_STREAM_PORT || 8554);
  }

  async startStream(config: StreamConfig): Promise<ActiveStream> {
    const existing = this.streams.get(config.cameraId);
    if (existing && existing.status === 'active') {
      return existing;
    }

    const port = config.port || this.basePort + this.streams.size;
    const wsUrl = `ws://localhost:${port}`;

    try {
      const httpServer = createServer();
      const wss = new WebSocketServer({ server: httpServer });

      wss.on('connection', (ws) => {
        logger.info('RTSP stream viewer connected', { cameraId: config.cameraId });
        const stream = this.streams.get(config.cameraId);
        if (stream) {
          stream.viewers++;
        }

        ws.on('close', () => {
          logger.info('RTSP stream viewer disconnected', { cameraId: config.cameraId });
          const stream = this.streams.get(config.cameraId);
          if (stream) {
            stream.viewers = Math.max(0, stream.viewers - 1);
          }
        });

        ws.on('error', (error) => {
          logger.error('RTSP stream WebSocket error', { cameraId: config.cameraId, error });
        });
      });

      httpServer.listen(port, () => {
        logger.info('RTSP stream server started', { cameraId: config.cameraId, port, rtspUrl: config.rtspUrl });
      });

      const stream: ActiveStream = {
        cameraId: config.cameraId,
        wsUrl,
        viewers: 0,
        status: 'active',
      };

      this.streams.set(config.cameraId, stream);
      this.wsServers.set(config.cameraId, wss);
      this.httpServers.set(config.cameraId, httpServer);

      return stream;
    } catch (error) {
      logger.error('Failed to start RTSP stream', { cameraId: config.cameraId, error });
      const failed: ActiveStream = {
        cameraId: config.cameraId,
        wsUrl: '',
        viewers: 0,
        status: 'error',
      };
      this.streams.set(config.cameraId, failed);
      throw error;
    }
  }

  async stopStream(cameraId: string): Promise<void> {
    const stream = this.streams.get(cameraId);
    if (!stream) return;

    const wss = this.wsServers.get(cameraId);
    const httpServer = this.httpServers.get(cameraId);

    if (wss) {
      wss.close();
      this.wsServers.delete(cameraId);
    }

    if (httpServer) {
      return new Promise((resolve) => {
        httpServer.close(() => {
          logger.info('RTSP stream server stopped', { cameraId });
          resolve();
        });
      });
    }

    this.streams.delete(cameraId);
  }

  getStream(cameraId: string): ActiveStream | null {
    return this.streams.get(cameraId) || null;
  }

  listStreams(): ActiveStream[] {
    return Array.from(this.streams.values());
  }

  getViewerCount(cameraId: string): number {
    return this.streams.get(cameraId)?.viewers || 0;
  }
}
