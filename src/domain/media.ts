export type CaptureState =
  | 'intro'
  | 'requesting-permission'
  | 'switching-camera'
  | 'live'
  | 'recording'
  | 'finalizing'
  | 'review'
  | 'error'

export type CameraFacing = 'user' | 'environment'

export type CameraErrorKind =
  | 'permission-denied'
  | 'insecure-context'
  | 'camera-unavailable'
  | 'camera-busy'
  | 'unsupported'
  | 'recording-failed'
  | 'unknown'

export interface CameraError {
  kind: CameraErrorKind
  message: string
}

export interface RecordedTake {
  blob: Blob
  objectUrl: string
  mimeType: string
  durationMs: number
  cameraFacing: CameraFacing
}

export interface CapturedMedia {
  blob: Blob
  mimeType: string
  durationMs: number
}

export interface MediaCapturePort {
  openCamera(facing: CameraFacing, strict?: boolean): Promise<MediaStream>
  start(stream: MediaStream): void
  stop(): Promise<CapturedMedia>
  dispose(): void
}
