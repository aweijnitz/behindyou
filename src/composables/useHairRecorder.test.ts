import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HairRecorderOptions } from './useHairRecorder'
import {
  classifyCameraError,
  formatDuration,
  INTRO_STORAGE_KEY,
  MAX_RECORDING_MS,
  useHairRecorder,
} from './useHairRecorder'
import type { MediaCapturePort } from '@/domain/media'

function makeHarness(overrides: Partial<HairRecorderOptions> = {}) {
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
  }
  const url = { createObjectURL: vi.fn(() => 'blob:take'), revokeObjectURL: vi.fn() }
  let hook!: ReturnType<typeof useHairRecorder>
  const wrapper = mount(
    defineComponent({
      setup() {
        hook = useHairRecorder({ createCapture: () => port, storage, url, ...overrides })
        return () => null
      },
    }),
  )
  return { hook, wrapper, port, stream, stopTrack, storage, values, url }
}

describe('useHairRecorder', () => {
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

  it('recognizes an accepted intro preference', () => {
    const values = new Map([[INTRO_STORAGE_KEY, 'true']])
    const { hook } = makeHarness({
      storage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
      },
    })
    expect(hook.privacyAccepted.value).toBe(true)
  })
})
