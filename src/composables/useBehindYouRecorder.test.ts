import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BehindYouRecorderOptions } from './useBehindYouRecorder'
import {
  CAMERA_FACING_STORAGE_KEY,
  classifyCameraError,
  formatDuration,
  INTRO_STORAGE_KEY,
  LEGACY_INTRO_STORAGE_KEY,
  MAX_RECORDING_MS,
  useBehindYouRecorder,
} from './useBehindYouRecorder'
import type { MediaCapturePort } from '@/domain/media'

function makeHarness(overrides: Partial<BehindYouRecorderOptions> = {}) {
  const stopTrack = vi.fn()
  const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream
  const port: MediaCapturePort = {
    openCamera: vi.fn(async () => stream),
    start: vi.fn(),
    stop: vi.fn(async () => ({
      blob: new Blob(['video'], { type: 'video/mp4' }),
      mimeType: 'video/mp4',
      durationMs: 1_500,
    })),
    dispose: vi.fn(),
  }
  const values = new Map<string, string>()
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
  }
  const url = { createObjectURL: vi.fn(() => 'blob:take'), revokeObjectURL: vi.fn() }
  let hook!: ReturnType<typeof useBehindYouRecorder>
  const wrapper = mount(
    defineComponent({
      setup() {
        hook = useBehindYouRecorder({ createCapture: () => port, storage, url, ...overrides })
        return () => null
      },
    }),
  )
  return { hook, wrapper, port, stream, stopTrack, storage, values, url }
}

describe('useBehindYouRecorder', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  })

  it('accepts the privacy promise and opens the camera', async () => {
    const { hook, storage, stream } = makeHarness()
    expect(hook.state.value).toBe('intro')
    await hook.acceptPrivacy()
    expect(storage.setItem).toHaveBeenCalledWith(INTRO_STORAGE_KEY, 'true')
    expect(hook.liveStream.value).toStrictEqual(stream)
    expect(hook.state.value).toBe('live')
    expect(hook.canRecord.value).toBe(true)
  })

  it('records, finalizes, creates an object URL, and deletes without confirmation', async () => {
    let now = 100
    const { hook, port, url } = makeHarness({ now: () => now })
    await hook.acceptPrivacy()
    hook.startRecording()
    expect(port.start).toHaveBeenCalled()
    expect(hook.state.value).toBe('recording')
    now = 1_600
    await hook.stopRecording()
    expect(hook.state.value).toBe('review')
    expect(hook.take.value?.objectUrl).toBe('blob:take')
    hook.deleteTake()
    expect(url.revokeObjectURL).toHaveBeenCalledWith('blob:take')
    expect(hook.take.value).toBeNull()
    expect(hook.state.value).toBe('intro')
  })

  it('auto-stops at sixty seconds and updates elapsed time', async () => {
    vi.useFakeTimers()
    let now = 0
    const { hook, port } = makeHarness({ now: () => now })
    await hook.acceptPrivacy()
    hook.startRecording()
    now = MAX_RECORDING_MS
    await vi.advanceTimersByTimeAsync(MAX_RECORDING_MS)
    expect(port.stop).toHaveBeenCalledOnce()
    expect(hook.elapsedMs.value).toBe(MAX_RECORDING_MS)
    expect(hook.state.value).toBe('review')
    vi.useRealTimers()
  })

  it('discards a take before opening a new camera session', async () => {
    const { hook, port, url } = makeHarness()
    await hook.acceptPrivacy()
    hook.startRecording()
    await hook.stopRecording()
    await hook.startNewTake()
    expect(url.revokeObjectURL).toHaveBeenCalled()
    expect(port.openCamera).toHaveBeenCalledTimes(2)
    expect(hook.state.value).toBe('live')
  })

  it('switches cameras, persists the selection, and records its orientation', async () => {
    const { hook, port, storage } = makeHarness()
    await hook.acceptPrivacy()
    await hook.switchCamera()
    expect(port.openCamera).toHaveBeenLastCalledWith('environment', true)
    expect(hook.cameraFacing.value).toBe('environment')
    expect(storage.setItem).toHaveBeenCalledWith(CAMERA_FACING_STORAGE_KEY, 'environment')
    hook.startRecording()
    await hook.stopRecording()
    expect(hook.take.value?.cameraFacing).toBe('environment')
  })

  it('restores the working camera and shows a temporary notice when switching is unavailable', async () => {
    vi.useFakeTimers()
    const { hook, port, stream } = makeHarness()
    vi.mocked(port.openCamera)
      .mockResolvedValueOnce(stream)
      .mockRejectedValueOnce(new DOMException('missing', 'OverconstrainedError'))
      .mockResolvedValueOnce(stream)
    await hook.acceptPrivacy()
    await hook.switchCamera()
    expect(port.openCamera).toHaveBeenLastCalledWith('user')
    expect(hook.state.value).toBe('live')
    expect(hook.cameraFacing.value).toBe('user')
    expect(hook.cameraNotice.value).toContain('Rear camera isn’t available')
    await vi.runAllTimersAsync()
    expect(hook.cameraNotice.value).toBeNull()
    vi.useRealTimers()
  })

  it('falls back from an unavailable persisted rear camera and updates the preference', async () => {
    const values = new Map([[CAMERA_FACING_STORAGE_KEY, 'environment']])
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    }
    const { hook, port, stream } = makeHarness({ storage })
    vi.mocked(port.openCamera)
      .mockRejectedValueOnce(new DOMException('missing', 'NotFoundError'))
      .mockResolvedValueOnce(stream)
    await hook.beginCamera()
    expect(port.openCamera).toHaveBeenNthCalledWith(1, 'environment', true)
    expect(port.openCamera).toHaveBeenNthCalledWith(2, 'user')
    expect(hook.cameraFacing.value).toBe('user')
    expect(values.get(CAMERA_FACING_STORAGE_KEY)).toBe('user')
  })

  it('uses the full error state for switch failures that cannot be restored', async () => {
    const denied = makeHarness()
    await denied.hook.acceptPrivacy()
    vi.mocked(denied.port.openCamera).mockRejectedValueOnce(
      new DOMException('denied', 'NotAllowedError'),
    )
    await denied.hook.switchCamera()
    expect(denied.hook.state.value).toBe('error')
    expect(denied.hook.error.value?.kind).toBe('permission-denied')

    const unavailable = makeHarness()
    await unavailable.hook.acceptPrivacy()
    vi.mocked(unavailable.port.openCamera)
      .mockRejectedValueOnce(new DOMException('missing', 'OverconstrainedError'))
      .mockRejectedValueOnce(new DOMException('busy', 'NotReadableError'))
    await unavailable.hook.switchCamera()
    expect(unavailable.hook.state.value).toBe('error')
    expect(unavailable.hook.error.value?.kind).toBe('camera-busy')
  })

  it('cleans all transient media when hidden and on unmount', async () => {
    const { hook, wrapper, port, stopTrack } = makeHarness()
    await hook.acceptPrivacy()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(port.dispose).toHaveBeenCalled()
    expect(stopTrack).toHaveBeenCalled()
    expect(hook.state.value).toBe('intro')
    wrapper.unmount()
    expect(port.dispose).toHaveBeenCalled()
  })

  it('ignores stale permission results after cleanup', async () => {
    let resolveCamera!: (stream: MediaStream) => void
    const cameraPromise = new Promise<MediaStream>((resolve) => (resolveCamera = resolve))
    const { hook, port, stream, stopTrack } = makeHarness()
    vi.mocked(port.openCamera).mockReturnValue(cameraPromise)
    const opening = hook.beginCamera()
    hook.cleanupSession()
    resolveCamera(stream)
    await opening
    expect(stopTrack).toHaveBeenCalled()
    expect(hook.liveStream.value).toBeNull()

    let rejectCamera!: (error: unknown) => void
    const rejectedCamera = new Promise<MediaStream>((_resolve, reject) => (rejectCamera = reject))
    const stale = makeHarness()
    vi.mocked(stale.port.openCamera).mockReturnValue(rejectedCamera)
    const rejectedOpening = stale.hook.beginCamera()
    stale.hook.cleanupSession()
    rejectCamera(new DOMException('gone', 'NotFoundError'))
    await rejectedOpening
    expect(stale.hook.state.value).toBe('intro')
  })

  it('surfaces open, start, and finalization failures', async () => {
    const first = makeHarness()
    vi.mocked(first.port.openCamera).mockRejectedValue(new DOMException('no', 'NotAllowedError'))
    await first.hook.beginCamera()
    expect(first.hook.error.value?.kind).toBe('permission-denied')
    expect(first.hook.state.value).toBe('error')

    const second = makeHarness()
    await second.hook.beginCamera()
    vi.mocked(second.port.start).mockImplementation(() => {
      throw new DOMException('bad', 'EncodingError')
    })
    second.hook.startRecording()
    expect(second.hook.state.value).toBe('error')

    const third = makeHarness()
    await third.hook.beginCamera()
    third.hook.startRecording()
    vi.mocked(third.port.stop).mockRejectedValue(new DOMException('bad', 'EncodingError'))
    await third.hook.stopRecording()
    expect(third.hook.error.value?.kind).toBe('recording-failed')
  })

  it('classifies browser failures and formats duration', () => {
    expect(classifyCameraError(new DOMException('', 'NotFoundError')).kind).toBe(
      'camera-unavailable',
    )
    expect(classifyCameraError(new DOMException('', 'OverconstrainedError')).kind).toBe(
      'camera-unavailable',
    )
    expect(classifyCameraError(new DOMException('', 'NotReadableError')).kind).toBe('camera-busy')
    expect(classifyCameraError(new DOMException('', 'InsecureContextError')).kind).toBe(
      'insecure-context',
    )
    expect(classifyCameraError(new DOMException('', 'NotSupportedError')).kind).toBe('unsupported')
    expect(classifyCameraError(new Error('unexpected')).kind).toBe('unknown')
    expect(formatDuration(-1)).toBe('0:00')
    expect(formatDuration(65_999)).toBe('1:05')
  })

  it('treats invalid commands and visible lifecycle events as safe no-ops', async () => {
    const { hook, port, wrapper } = makeHarness()
    hook.startRecording()
    await hook.stopRecording()
    hook.deleteTake()
    document.dispatchEvent(new Event('visibilitychange'))
    expect(port.start).not.toHaveBeenCalled()
    expect(port.stop).not.toHaveBeenCalled()
    expect(port.dispose).not.toHaveBeenCalled()
    window.dispatchEvent(new Event('pagehide'))
    expect(port.dispose).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('recognizes the accepted intro preference and migrates its legacy key', () => {
    const values = new Map([[LEGACY_INTRO_STORAGE_KEY, 'true']])
    const { hook } = makeHarness({
      storage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: (key) => values.delete(key),
      },
    })
    expect(hook.privacyAccepted.value).toBe(true)
    expect(values.get(INTRO_STORAGE_KEY)).toBe('true')
    expect(values.has(LEGACY_INTRO_STORAGE_KEY)).toBe(false)
  })

  it('removes an invalid persisted camera preference and defaults to selfie', () => {
    const values = new Map([[CAMERA_FACING_STORAGE_KEY, 'sideways']])
    const { hook } = makeHarness({
      storage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: (key) => values.delete(key),
      },
    })
    expect(hook.cameraFacing.value).toBe('user')
    expect(values.has(CAMERA_FACING_STORAGE_KEY)).toBe(false)
  })
})
