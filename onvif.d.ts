/**
 * Type declarations for the 'onvif' module
 * This module is used for ONVIF camera discovery and control
 */

declare module 'onvif' {
  interface OnvifDiscover {
    on(
      event: 'device',
      callback: (device: {
        hostname: string;
        port?: number;
        name?: string;
        manufacturer?: string;
      }) => void,
    ): void;
  }

  interface OnvifCam {
    Discover?: OnvifDiscover;
  }

  export const Cam: OnvifCam;
  export default OnvifCam;
}
