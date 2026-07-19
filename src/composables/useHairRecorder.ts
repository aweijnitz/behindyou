import { computed, onBeforeUnmount, readonly, ref, shallowRef } from 'vue'
import type {
  CameraError,
  CameraErrorKind,
  CaptureState,
  MediaCapturePort,
  RecordedTake,
} from '@/domain/media'
import { createBrowserMediaCapture } from '@/services/browserMediaCapture'

export const INTRO_STORAGE_KEY = 'hair-checker:privacy-intro-seen:v1'
export const MAX_RECORDING_MS = 60_000

interface Scheduler {
  setInterval(callback: () => void, delay: number): ReturnType<typeof setInterval>
  clearInterval(id: ReturnType<typeof setInterval>): void
  setTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout>
  clearTimeout(id: ReturnType<typeof setTimeout>): void
}

export interface HairRecorderOptions {
  createCapture?: () => MediaCapturePort
  storage?: Pick<Storage, 'getItem' | 'setItem'>
  url?: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>
  now?: () => number
  scheduler?: Scheduler
}

const defaultScheduler: Scheduler = {
  setInterval: (callback, delay) => setInterval(callback, delay),
  clearInterval: (id) => clearInterval(id),
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (id) => clearTimeout(id),
}

export function classifyCameraError(error: unknown): CameraError {
  const name = error instanceof DOMException ? error.name : ''
  const kinds: Record<string, CameraErrorKind> = {
    NotAllowedError: 'permission-denied',
    SecurityError: 'permission-denied',
    InsecureContextError: 'insecure-context',
    NotFoundError: 'camera-unavailable',
    NotReadableError: 'camera-busy',
    AbortError: 'camera-busy',
    NotSupportedError: 'unsupported',
    EncodingError: 'recording-failed',
  }
  const kind = kinds[name] ?? 'unknown'
  const messages: Record<CameraErrorKind, string> = {
    'permission-denied':
      'Camera access is off. Allow camera access in browser settings, then retry.',
    'insecure-context':
      'Camera access requires HTTPS on phones. Open this app from an HTTPS URL, not an http:// LAN address.',
    'camera-unavailable': 'No usable front camera was found on this device.',
    'camera-busy': 'The camera is being used by another app. Close it there, then retry.',
    unsupported: 'This browser cannot record camera video. Try a current Safari or Chrome version.',
    'recording-failed': 'The recording could not be completed. Please try a new take.',
    unknown: 'Something went wrong while opening or recording the camera.',
  }
  return { kind, message: messages[kind] }
}

export function useHairRecorder(options: HairRecorderOptions = {}) {
  const createCapture = options.createCapture ?? createBrowserMediaCapture
  const storage = options.storage ?? localStorage
  const url = options.url ?? URL
  const now = options.now ?? (() => performance.now())
  const scheduler = options.scheduler ?? defaultScheduler

  const privacyAccepted = ref(storage.getItem(INTRO_STORAGE_KEY) === 'true')
  const state = ref<CaptureState>('intro')
  const liveStream = shallowRef<MediaStream | null>(null)
  const take = shallowRef<RecordedTake | null>(null)
  const error = ref<CameraError | null>(null)
  const elapsedMs = ref(0)
  let capture: MediaCapturePort | null = null
  let startedAt = 0
  let intervalId: ReturnType<typeof setInterval> | null = null
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let requestVersion = 0

  const canRecord = computed(() => state.value === 'live' && !!liveStream.value)
  const formattedElapsed = computed(() => formatDuration(elapsedMs.value))

  async function beginCamera() {
    cleanupSession(false)
    const version = ++requestVersion
    state.value = 'requesting-permission'
    error.value = null
    try {
      capture = createCapture()
      const stream = await capture.openCamera()
      if (version !== requestVersion) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      liveStream.value = stream
      state.value = 'live'
    } catch (caught) {
      if (version !== requestVersion) return
      cleanupSession(false)
      error.value = classifyCameraError(caught)
      state.value = 'error'
    }
  }

  async function acceptPrivacy() {
    privacyAccepted.value = true
    storage.setItem(INTRO_STORAGE_KEY, 'true')
    await beginCamera()
  }

  function startRecording() {
    if (!capture || !liveStream.value || state.value !== 'live') return
    releaseTake()
    try {
      capture.start(liveStream.value)
      startedAt = now()
      elapsedMs.value = 0
      state.value = 'recording'
      intervalId = scheduler.setInterval(() => {
        elapsedMs.value = Math.min(MAX_RECORDING_MS, now() - startedAt)
      }, 100)
      timeoutId = scheduler.setTimeout(() => void stopRecording(), MAX_RECORDING_MS)
    } catch (caught) {
      error.value = classifyCameraError(caught)
      state.value = 'error'
    }
  }

  async function stopRecording() {
    if (!capture || state.value !== 'recording') return
    clearTimers()
    elapsedMs.value = Math.min(MAX_RECORDING_MS, now() - startedAt)
    state.value = 'finalizing'
    try {
      const media = await capture.stop()
      liveStream.value = null
      take.value = {
        ...media,
        objectUrl: url.createObjectURL(media.blob),
      }
      state.value = 'review'
    } catch (caught) {
      cleanupSession(false)
      error.value = classifyCameraError(caught)
      state.value = 'error'
    }
  }

  function deleteTake() {
    releaseTake()
    state.value = 'intro'
  }

  function releaseTake() {
    if (!take.value) return
    url.revokeObjectURL(take.value.objectUrl)
    take.value = null
    elapsedMs.value = 0
  }

  async function startNewTake() {
    releaseTake()
    await beginCamera()
  }

  async function retryCamera() {
    await beginCamera()
  }

  function handleAppHidden() {
    if (document.visibilityState !== 'hidden') return
    cleanupSession(true)
  }

  function handlePageHide() {
    cleanupSession(true)
  }

  function cleanupSession(resetToIntro = true) {
    requestVersion += 1
    clearTimers()
    capture?.dispose()
    capture = null
    liveStream.value?.getTracks().forEach((track) => track.stop())
    liveStream.value = null
    releaseTake()
    if (resetToIntro) state.value = 'intro'
  }

  function clearTimers() {
    if (intervalId !== null) scheduler.clearInterval(intervalId)
    if (timeoutId !== null) scheduler.clearTimeout(timeoutId)
    intervalId = null
    timeoutId = null
  }

  document.addEventListener('visibilitychange', handleAppHidden)
  window.addEventListener('pagehide', handlePageHide)

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', handleAppHidden)
    window.removeEventListener('pagehide', handlePageHide)
    cleanupSession(false)
  })

  return {
    state: readonly(state),
    liveStream: readonly(liveStream),
    take: readonly(take),
    error: readonly(error),
    elapsedMs: readonly(elapsedMs),
    privacyAccepted: readonly(privacyAccepted),
    canRecord,
    formattedElapsed,
    acceptPrivacy,
    beginCamera,
    startRecording,
    stopRecording,
    deleteTake,
    startNewTake,
    retryCamera,
    cleanupSession,
  }
}

export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
