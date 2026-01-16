# Visual Guidance System

## Overview

The Visual Guidance System provides comprehensive support for multiple Optical Zoom WiFi cameras with real-time streaming, object detection/tracking, video recording, and camera control (pan, tilt, zoom, focus) via ONVIF and RTSP protocols.

## Architecture

The system consists of:
- **CameraService**: Manages camera connections, discovery, and metadata
- **OnvifClient**: Handles ONVIF protocol communication and PTZ control
- **RTSPStreamService**: Manages RTSP streaming and WebSocket relay
- **ComputerVisionService**: Object detection and tracking
- **RecordingService**: Video recording and storage management
- **VisionAgent**: Orchestrates all vision-related tasks

## Features

### Camera Management
- ONVIF camera discovery on local network
- Manual camera addition (ONVIF or RTSP)
- Camera connection/disconnection
- Camera metadata storage (capabilities, credentials)
- Encrypted password storage

### Streaming
- Real-time RTSP stream access
- WebSocket-based streaming for web clients
- Multi-camera concurrent streaming
- Stream health monitoring

### Camera Control (PTZ)
- Pan/Tilt/Zoom control (absolute and relative)
- Preset management (save/recall)
- PTZ position query
- Speed control for smooth movements

### Object Detection
- Object detection on camera feeds
- Multi-object tracking across frames
- Detection result storage and querying
- Configurable confidence thresholds

### Recording
- Manual and scheduled recording
- Multi-camera synchronized recording
- Storage management with retention policies
- Playback API for recorded footage

## API Endpoints

### Camera Management

**POST** `/api/vision/cameras`
Add a new camera.

Request body:
```json
{
  "name": "Front Door Camera",
  "protocol": "onvif",
  "ipAddress": "192.168.1.100",
  "username": "admin",
  "password": "password",
  "model": "Hikvision DS-2CD2T47G1-L"
}
```

**GET** `/api/vision/cameras`
List all cameras (optionally filter by `?activeOnly=true`).

**GET** `/api/vision/cameras/:id`
Get camera details including streams, recordings, and detections.

**PUT** `/api/vision/cameras/:id`
Update camera configuration.

**DELETE** `/api/vision/cameras/:id`
Remove camera and disconnect.

**POST** `/api/vision/cameras/:id/connect`
Connect to camera (ONVIF).

**POST** `/api/vision/cameras/:id/disconnect`
Disconnect from camera.

**POST** `/api/vision/cameras/discover`
Discover ONVIF cameras on network.

Request body:
```json
{
  "timeout": 5000
}
```

### Streaming

**POST** `/api/vision/streams/:cameraId/start`
Start streaming from camera.

**POST** `/api/vision/streams/:cameraId/stop`
Stop streaming.

**GET** `/api/vision/streams/:cameraId`
Get stream status and WebSocket URL.

**GET** `/api/vision/streams`
List all active streams.

### Camera Control (PTZ)

**POST** `/api/vision/cameras/:id/ptz/move`
Move camera PTZ.

Request body:
```json
{
  "pan": 0.5,
  "tilt": -0.3,
  "zoom": 0.2,
  "speed": {
    "pan": 0.5,
    "tilt": 0.5,
    "zoom": 0.5
  }
}
```

**POST** `/api/vision/cameras/:id/ptz/stop`
Stop PTZ movement.

**GET** `/api/vision/cameras/:id/ptz/status`
Get current PTZ position.

**POST** `/api/vision/cameras/:id/ptz/preset`
Save or recall preset.

Request body:
```json
{
  "token": "preset1",
  "name": "Front Door",
  "action": "set"
}
```

**GET** `/api/vision/cameras/:id/ptz/presets`
List all presets.

### Object Detection

**POST** `/api/vision/detect/:cameraId`
Trigger object detection.

Request body:
```json
{
  "frameData": "base64-encoded-image",
  "confidenceThreshold": 0.5
}
```

**GET** `/api/vision/detections`
Query detections with filters:
- `?cameraId=xxx`
- `?objectType=person`
- `?startTime=2026-01-14T00:00:00Z`
- `?endTime=2026-01-14T23:59:59Z`
- `?minConfidence=0.7`
- `?limit=100`

**GET** `/api/vision/detections/:id`
Get detection details.

### Recording

**POST** `/api/vision/recordings/start`
Start recording.

Request body:
```json
{
  "cameraIds": ["camera-id-1", "camera-id-2"],
  "duration": 3600,
  "startTime": "2026-01-14T10:00:00Z"
}
```

**POST** `/api/vision/recordings/:id/stop`
Stop recording.

**GET** `/api/vision/recordings`
List recordings with filters:
- `?cameraId=xxx`
- `?status=completed`
- `?startTime=2026-01-14T00:00:00Z`
- `?endTime=2026-01-14T23:59:59Z`
- `?limit=50`

**GET** `/api/vision/recordings/:id/playback`
Get playback URL.

**GET** `/api/vision/recordings/:id/download`
Download recording file.

## Environment Variables

- `VISION_ENABLED` - Enable/disable vision system (default: `true`)
- `ONVIF_DISCOVERY_TIMEOUT` - Network scan timeout in ms (default: `5000`)
- `RTSP_STREAM_PORT` - Base port for RTSP streams (default: `8554`)
- `RECORDING_STORAGE_PATH` - Path for video recordings (default: `./recordings`)
- `RECORDING_RETENTION_DAYS` - Days to keep recordings (default: `30`)
- `CV_MODEL_PATH` - Path to detection model (optional)
- `CV_CONFIDENCE_THRESHOLD` - Detection confidence threshold (default: `0.5`)
- `CAMERA_ENCRYPTION_KEY` - Key for encrypting camera passwords (auto-generated if not set)

## Database Models

### Camera
Stores camera configuration and metadata.

### Stream
Tracks active streams and viewer counts.

### Recording
Manages video recordings with file paths and metadata.

### Detection
Stores object detection results with bounding boxes and tracking IDs.

## Security

- Camera passwords are encrypted at rest using AES-256-CBC
- Encryption key should be set via `CAMERA_ENCRYPTION_KEY` environment variable
- Camera credentials are never returned in API responses

## Usage Example

```typescript
// Discover cameras
const cameras = await visionAgent.discoverCameras(5000);

// Add camera
const cameraId = await visionAgent.addCamera({
  name: 'Front Door',
  protocol: 'onvif',
  ipAddress: '192.168.1.100',
  username: 'admin',
  password: 'password',
});

// Connect and start streaming
await visionAgent.connectCamera(cameraId);
const stream = await visionAgent.startStream(cameraId);

// Control PTZ
await visionAgent.movePTZ(cameraId, { pan: 0.5, tilt: 0.3, zoom: 0.2 });

// Detect objects
const detections = await visionAgent.detectObjects(cameraId, {
  frameUrl: 'https://example.com/frame.jpg',
  confidenceThreshold: 0.7,
});

// Start recording
const recordingIds = await visionAgent.startRecording({
  cameraIds: [cameraId],
  duration: 3600, // 1 hour
});
```

## Notes

- ONVIF discovery requires cameras to be on the same network
- RTSP streams may need transcoding for web compatibility (consider HLS or WebRTC)
- Object detection uses mock implementation; replace with TensorFlow.js or external API
- Recording storage should have cleanup policies to prevent disk fill
- PTZ operations should have rate limiting to prevent camera overload
- Multi-camera operations are parallelized where possible

## Future Enhancements

- GPU acceleration for object detection
- HLS/WebRTC streaming for better web compatibility
- Motion detection and alerts
- Face recognition
- License plate recognition
- Multi-camera object correlation and tracking
- Automated recording on detection events
