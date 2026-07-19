import type { CameraFacing, CapturedMedia, MediaCapturePort } from '@/domain/media'

export const MIME_TYPE_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4',
  'video/webm;codecs=vp8',
  'video/webm',
] as const

export function selectSupportedMimeType(MediaRecorderCtor: typeof MediaRecorder): string {
  return MIME_TYPE_CANDIDATES.find((mimeType) => MediaRecorderCtor.isTypeSupported(mimeType)) ?? ''
}

export function cameraConstraints(
  facing: CameraFacing = 'user',
  strict = false,
): MediaStreamConstraints {
  return {
    audio: false,
    video: {
      facingMode: strict ? { exact: facing } : { ideal: facing },
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 30 },
    },
  }
}

export class BrowserMediaCapture implements MediaCapturePort {
  private stream: MediaStream | null = null
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private startedAt = 0
  private readonly mediaDevices: MediaDevices
  private readonly MediaRecorderCtor: typeof MediaRecorder
  private readonly now: () => number

  constructor(
    mediaDevices: MediaDevices = navigator.mediaDevices,
    MediaRecorderCtor: typeof MediaRecorder = MediaRecorder,
    now: () => number = () => performance.now(),
  ) {
    this.mediaDevices = mediaDevices
    this.MediaRecorderCtor = MediaRecorderCtor
    this.now = now
  }

  async openCamera(facing: CameraFacing, strict = false): Promise<MediaStream> {
    if (!this.mediaDevices?.getUserMedia || !this.MediaRecorderCtor) {
      throw new DOMException('Camera recording is not supported.', 'NotSupportedError')
    }
    this.stopTracks()
    this.stream = await this.mediaDevices.getUserMedia(cameraConstraints(facing, strict))
    return this.stream
  }

  start(stream: MediaStream): void {
    if (this.recorder?.state === 'recording') {
      throw new DOMException('A recording is already in progress.', 'InvalidStateError')
    }

    const mimeType = selectSupportedMimeType(this.MediaRecorderCtor)
    this.stream = stream
    this.chunks = []
    this.recorder = new this.MediaRecorderCtor(stream, mimeType ? { mimeType } : undefined)
    this.recorder.addEventListener('dataavailable', this.collectChunk)
    this.startedAt = this.now()
    this.recorder.start(1000)
  }

  stop(): Promise<CapturedMedia> {
    const recorder = this.recorder
    if (!recorder || recorder.state === 'inactive') {
      return Promise.reject(new DOMException('No recording is in progress.', 'InvalidStateError'))
    }

    return new Promise((resolve, reject) => {
      const finish = () => {
        const mimeType = recorder.mimeType || this.chunks[0]?.type || 'video/mp4'
        const blob = new Blob(this.chunks, { type: mimeType })
        const durationMs = Math.max(0, this.now() - this.startedAt)
        this.detachRecorder(recorder)
        this.stopTracks()
        this.chunks = []
        resolve({ blob, mimeType, durationMs })
      }
      const fail = () => {
        this.detachRecorder(recorder)
        this.stopTracks()
        this.chunks = []
        reject(new DOMException('The browser could not finish the recording.', 'EncodingError'))
      }
      recorder.addEventListener('stop', finish, { once: true })
      recorder.addEventListener('error', fail, { once: true })
      recorder.stop()
    })
  }

  dispose(): void {
    const recorder = this.recorder
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }
    if (recorder) this.detachRecorder(recorder)
    this.stopTracks()
    this.chunks = []
    this.recorder = null
  }

  private readonly collectChunk = (event: BlobEvent) => {
    if (event.data.size > 0) this.chunks.push(event.data)
  }

  private detachRecorder(recorder: MediaRecorder) {
    recorder.removeEventListener('dataavailable', this.collectChunk)
    this.recorder = null
  }

  private stopTracks() {
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = null
  }
}

export function createBrowserMediaCapture(): MediaCapturePort {
  if (window.isSecureContext === false) {
    throw new DOMException('Camera access requires HTTPS.', 'InsecureContextError')
  }
  if (!navigator.mediaDevices || !globalThis.MediaRecorder) {
    throw new DOMException('Camera recording is not supported.', 'NotSupportedError')
  }
  return new BrowserMediaCapture()
}
