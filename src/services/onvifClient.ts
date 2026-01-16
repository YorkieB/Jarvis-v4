import logger from '../utils/logger';

// Dynamic import for onvif to handle potential module structure differences
function getOnvifCam(): any {
  try {
    const onvifModule = require('onvif');
    return onvifModule.Cam || onvifModule.default?.Cam || onvifModule;
  } catch (error) {
    logger.warn('ONVIF module not available', { error });
    throw new Error('ONVIF module not installed. Run: npm install onvif');
  }
}

export interface OnvifCameraInfo {
  hostname: string;
  port: number;
  username: string;
  password: string;
}

export interface PTZPosition {
  pan: number;
  tilt: number;
  zoom: number;
}

export interface PTZCapabilities {
  hasPan: boolean;
  hasTilt: boolean;
  hasZoom: boolean;
  panRange?: { min: number; max: number };
  tiltRange?: { min: number; max: number };
  zoomRange?: { min: number; max: number };
}

export interface StreamProfile {
  token: string;
  name: string;
  videoEncoding: string;
  resolution: { width: number; height: number };
  rtspUrl: string;
}

export class OnvifClient {
  private camera: any = null;
  private info: OnvifCameraInfo;

  constructor(info: OnvifCameraInfo) {
    this.info = info;
  }

  async connect(): Promise<void> {
    const Cam = getOnvifCam();
    return new Promise((resolve, reject) => {
      this.camera = new Cam(
        {
          hostname: this.info.hostname,
          port: this.info.port,
          username: this.info.username,
          password: this.info.password,
        },
        (err) => {
          if (err) {
            logger.error('ONVIF connection failed', { hostname: this.info.hostname, error: err });
            reject(err);
            return;
          }
          logger.info('ONVIF camera connected', { hostname: this.info.hostname });
          resolve();
        },
      );
    });
  }

  async disconnect(): Promise<void> {
    this.camera = null;
  }

  async getCapabilities(): Promise<PTZCapabilities> {
    if (!this.camera) throw new Error('Camera not connected');

    return new Promise((resolve, reject) => {
      this.camera!.getCapabilities((err, data) => {
        if (err) {
          reject(err);
          return;
        }

        const ptz = data.PTZ;
        resolve({
          hasPan: !!ptz,
          hasTilt: !!ptz,
          hasZoom: !!ptz,
          panRange: ptz?.X?.Range ? { min: ptz.X.Range.Min, max: ptz.X.Range.Max } : undefined,
          tiltRange: ptz?.Y?.Range ? { min: ptz.Y.Range.Min, max: ptz.Y.Range.Max } : undefined,
          zoomRange: ptz?.Z?.Range ? { min: ptz.Z.Range.Min, max: ptz.Z.Range.Max } : undefined,
        });
      });
    });
  }

  async getStreamProfiles(): Promise<StreamProfile[]> {
    if (!this.camera) throw new Error('Camera not connected');

    return new Promise((resolve, reject) => {
      this.camera!.getStreamUri({ protocol: 'RTSP' }, (err, data) => {
        if (err) {
          reject(err);
          return;
        }

        this.camera!.getProfiles((profileErr, profiles) => {
          if (profileErr) {
            reject(profileErr);
            return;
          }

          const result: StreamProfile[] = profiles.map((profile: any) => ({
            token: profile.$.token,
            name: profile.name,
            videoEncoding: profile.video?.encoderConfiguration?.encoding || 'H.264',
            resolution: {
              width: profile.video?.encoderConfiguration?.resolution?.width || 1920,
              height: profile.video?.encoderConfiguration?.resolution?.height || 1080,
            },
            rtspUrl: data.uri,
          }));

          resolve(result);
        });
      });
    });
  }

  async getPTZPosition(): Promise<PTZPosition> {
    if (!this.camera) throw new Error('Camera not connected');

    return new Promise((resolve, reject) => {
      this.camera!.getStatus({}, (err, data) => {
        if (err) {
          reject(err);
          return;
        }

        resolve({
          pan: data.position?.panTilt?.x || 0,
          tilt: data.position?.panTilt?.y || 0,
          zoom: data.position?.zoom?.x || 0,
        });
      });
    });
  }

  async movePTZ(options: {
    pan?: number;
    tilt?: number;
    zoom?: number;
    speed?: { pan?: number; tilt?: number; zoom?: number };
  }): Promise<void> {
    if (!this.camera) throw new Error('Camera not connected');

    return new Promise((resolve, reject) => {
      const speed = options.speed || { pan: 0.5, tilt: 0.5, zoom: 0.5 };
      const velocity = {
        x: options.pan !== undefined ? options.pan : 0,
        y: options.tilt !== undefined ? options.tilt : 0,
        zoom: options.zoom !== undefined ? options.zoom : 0,
      };

      this.camera!.continuousMove(
        {
          speed: {
            x: speed.pan || 0,
            y: speed.tilt || 0,
            z: speed.zoom || 0,
          },
          timeout: 1,
        },
        (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        },
      );
    });
  }

  async stopPTZ(): Promise<void> {
    if (!this.camera) throw new Error('Camera not connected');

    return new Promise((resolve, reject) => {
      this.camera!.stop({}, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  async absoluteMove(position: PTZPosition): Promise<void> {
    if (!this.camera) throw new Error('Camera not connected');

    return new Promise((resolve, reject) => {
      this.camera!.absoluteMove(
        {
          position: {
            x: position.pan,
            y: position.tilt,
            z: position.zoom,
          },
          speed: {
            x: 0.5,
            y: 0.5,
            z: 0.5,
          },
        },
        (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        },
      );
    });
  }

  async setPreset(token: string, name?: string): Promise<void> {
    if (!this.camera) throw new Error('Camera not connected');

    return new Promise((resolve, reject) => {
      this.camera!.setPreset(
        {
          presetToken: token,
          presetName: name,
        },
        (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        },
      );
    });
  }

  async gotoPreset(token: string): Promise<void> {
    if (!this.camera) throw new Error('Camera not connected');

    return new Promise((resolve, reject) => {
      this.camera!.gotoPreset(
        {
          preset: token,
          speed: { x: 0.5, y: 0.5, z: 0.5 },
        },
        (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        },
      );
    });
  }

  async getPresets(): Promise<Array<{ token: string; name: string }>> {
    if (!this.camera) throw new Error('Camera not connected');

    return new Promise((resolve, reject) => {
      this.camera!.getPresets({}, (err, data) => {
        if (err) {
          reject(err);
          return;
        }

        const presets = Array.isArray(data) ? data : [data];
        resolve(
          presets.map((preset: any) => ({
            token: preset.$.token,
            name: preset.name || preset.$.token,
          })),
        );
      });
    });
  }
}
