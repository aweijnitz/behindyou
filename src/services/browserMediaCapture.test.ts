import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BrowserMediaCapture,
  cameraConstraints,
  createBrowserMediaCapture,
  MIME_TYPE_CANDIDATES,
  selectSupportedMimeType,
} from './browserMediaCapture'

class FakeMediaRecorder extends EventTarget {
  static supported = new Set<string>(MIME_TYPE_CANDIDATES)
  static isTypeSupported(type: string) {
    return this.supported.has(type)
  }

  state: RecordingState = 'inactive'
  mimeType: string

  constructor(
    public stream: MediaStream,
    options?: MediaRecorderOptions,
  ) {
    super()
    this.mimeType = options?.mimeType ?? 'video/mp4'
  }

  start = vi.fn(() => {
    this.state = 'recording'
  })

  stop = vi.fn(() => {
    this.dispatchEvent(
      new BlobEvent('dataavailable', { data: new Blob(['take'], { type: this.mimeType }) }),
    )
    this.state = 'inactive'
    this.dispatchEvent(new Event('stop'))
  })
}

describe('browser media capture', () => {
  const stopTrack = vi.fn()
  const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream
  const getUserMedia = vi.fn(async () => stream)

  beforeEach(() => {
    vi.clearAllMocks()
    FakeMediaRecorder.supported = new Set(MIME_TYPE_CANDIDATES)
  })

  it('requests a silent front camera with non-mandatory quality targets', () => {
    expect(cameraConstraints()).toEqual({
      audio: false,
      video: {
        facingMode: { ideal: 'user' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 30 },
      },
    })
    expect(cameraConstraints('environment', true)).toEqual({
      audio: false,
      video: {
        facingMode: { exact: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 30 },
      },
    })
  })

  it('selects the first supported MIME type and permits a browser default', () => {
    FakeMediaRecorder.supported = new Set(['video/webm'])
    expect(selectSupportedMimeType(FakeMediaRecorder as unknown as typeof MediaRecorder)).toBe(
      'video/webm',
    )
    FakeMediaRecorder.supported.clear()
    expect(selectSupportedMimeType(FakeMediaRecorder as unknown as typeof MediaRecorder)).toBe('')
  })

  it('opens, records, returns an in-memory blob, and stops tracks', async () => {
    let now = 100
    const capture = new BrowserMediaCapture(
      { getUserMedia } as unknown as MediaDevices,
      FakeMediaRecorder as unknown as typeof MediaRecorder,
      () => now,
    )
    const opened = await capture.openCamera('user')
    expect(opened).toBe(stream)
    expect(getUserMedia).toHaveBeenCalledWith(cameraConstraints())

    capture.start(opened)
    now = 1_600
    const result = await capture.stop()
    expect(await result.blob.text()).toBe('take')
    expect(result.durationMs).toBe(1_500)
    expect(result.mimeType).toBe(MIME_TYPE_CANDIDATES[0])
    expect(stopTrack).toHaveBeenCalledOnce()
  })

  it('rejects stop without an active recording', async () => {
    const capture = new BrowserMediaCapture(
      { getUserMedia } as unknown as MediaDevices,
      FakeMediaRecorder as unknown as typeof MediaRecorder,
    )
    await expect(capture.stop()).rejects.toMatchObject({ name: 'InvalidStateError' })
  })

  it('rejects a duplicate recording and disposes safely', async () => {
    const capture = new BrowserMediaCapture(
      { getUserMedia } as unknown as MediaDevices,
      FakeMediaRecorder as unknown as typeof MediaRecorder,
    )
    const opened = await capture.openCamera('user')
    capture.start(opened)
    expect(() => capture.start(opened)).toThrowError(DOMException)
    capture.dispose()
    capture.dispose()
    expect(stopTrack).toHaveBeenCalled()
  })

  it('rejects when the recorder emits an error', async () => {
    class ErrorRecorder extends FakeMediaRecorder {
      override stop = vi.fn(() => {
        this.state = 'inactive'
        this.dispatchEvent(new Event('error'))
      })
    }
    const capture = new BrowserMediaCapture(
      { getUserMedia } as unknown as MediaDevices,
      ErrorRecorder as unknown as typeof MediaRecorder,
    )
    capture.start(stream)
    await expect(capture.stop()).rejects.toMatchObject({ name: 'EncodingError' })
    expect(stopTrack).toHaveBeenCalled()
  })

  it('feature-detects missing browser media APIs', () => {
    const original = navigator.mediaDevices
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
    expect(() => createBrowserMediaCapture()).toThrowError(DOMException)
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: original })
  })

  it('explains that phone camera access requires a secure context', () => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false })
    expect(() => createBrowserMediaCapture()).toThrowError(
      expect.objectContaining({ name: 'InsecureContextError' }),
    )
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
  })

  it('uses the browser recorder default when no advertised MIME type is supported', async () => {
    FakeMediaRecorder.supported.clear()
    const capture = new BrowserMediaCapture(
      { getUserMedia } as unknown as MediaDevices,
      FakeMediaRecorder as unknown as typeof MediaRecorder,
      () => 10,
    )
    const opened = await capture.openCamera('user')
    capture.start(opened)
    const result = await capture.stop()
    expect(result.mimeType).toBe('video/mp4')
    expect(result.durationMs).toBe(0)
  })

  it('stops an old stream before opening a replacement', async () => {
    const capture = new BrowserMediaCapture(
      { getUserMedia } as unknown as MediaDevices,
      FakeMediaRecorder as unknown as typeof MediaRecorder,
    )
    await capture.openCamera('user')
    await capture.openCamera('environment', true)
    expect(stopTrack).toHaveBeenCalledOnce()
  })
})
