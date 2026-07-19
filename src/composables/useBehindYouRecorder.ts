import { computed, onBeforeUnmount, readonly, ref, shallowRef } from 'vue'
import type {
  CameraError,
  CameraErrorKind,
  CameraFacing,
  CaptureState,
  MediaCapturePort,
  RecordedTake,
} from '@/domain/media'
import { createBrowserMediaCapture } from '@/services/browserMediaCapture'

export const INTRO_STORAGE_KEY = 'behind-you:privacy-intro-seen:v1'
export const CAMERA_FACING_STORAGE_KEY = 'behind-you:camera-facing:v1'
export const LEGACY_INTRO_STORAGE_KEY = 'hair-checker:privacy-intro-seen:v1'
export const MAX_RECORDING_MS = 60_000
export const CAMERA_NOTICE_MS = 3_000

interface Scheduler {
  setInterval(callback: () => void, delay: number): ReturnType<typeof setInterval>
  clearInterval(id: ReturnType<typeof setInterval>): void
  setTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout>
  clearTimeout(id: ReturnType<typeof setTimeout>): void
}

export interface BehindYouRecorderOptions {
  createCapture?: () => MediaCapturePort
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
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
    OverconstrainedError: 'camera-unavailable',
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
    'camera-unavailable': 'The requested camera is not available on this device.',
    'camera-busy': 'The camera is being used by another app. Close it there, then retry.',
    unsupported: 'This browser cannot record camera video. Try a current Safari or Chrome version.',
    'recording-failed': 'The recording could not be completed. Please try a new take.',
    unknown: 'Something went wrong while opening or recording the camera.',
  }
  return { kind, message: messages[kind] }
}

export function useBehindYouRecorder(options: BehindYouRecorderOptions = {}) {
  const createCapture = options.createCapture ?? createBrowserMediaCapture
  const storage = options.storage ?? localStorage
  const url = options.url ?? URL
  const now = options.now ?? (() => performance.now())
  const scheduler = options.scheduler ?? defaultScheduler

  const migratedPrivacyAccepted = storage.getItem(LEGACY_INTRO_STORAGE_KEY) === 'true'
  const privacyAccepted = ref(
    storage.getItem(INTRO_STORAGE_KEY) === 'true' || migratedPrivacyAccepted,
  )
  if (migratedPrivacyAccepted) storage.setItem(INTRO_STORAGE_KEY, 'true')
  storage.removeItem(LEGACY_INTRO_STORAGE_KEY)

  const storedFacing = storage.getItem(CAMERA_FACING_STORAGE_KEY)
  const cameraFacing = ref<CameraFacing>(storedFacing === 'environment' ? 'environment' : 'user')
  if (storedFacing !== null && storedFacing !== 'user' && storedFacing !== 'environment') {
    storage.removeItem(CAMERA_FACING_STORAGE_KEY)
  }
  const state = ref<CaptureState>('intro')
  const liveStream = shallowRef<MediaStream | null>(null)
  const take = shallowRef<RecordedTake | null>(null)
  const error = ref<CameraError | null>(null)
  const cameraNotice = ref<string | null>(null)
  const elapsedMs = ref(0)
  let capture: MediaCapturePort | null = null
  let startedAt = 0
  let intervalId: ReturnType<typeof setInterval> | null = null
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let noticeTimeoutId: ReturnType<typeof setTimeout> | null = null
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
      let stream: MediaStream
      try {
        stream = await capture.openCamera(cameraFacing.value, cameraFacing.value === 'environment')
      } catch (caught) {
        if (version !== requestVersion) return
        if (!isCameraUnavailable(caught) || cameraFacing.value !== 'environment') throw caught
        stream = await capture.openCamera('user')
        if (version !== requestVersion) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        cameraFacing.value = 'user'
        storage.setItem(CAMERA_FACING_STORAGE_KEY, 'user')
        showCameraNotice('Rear camera isn’t available. Continuing with the front camera.')
      }
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

  async function switchCamera() {
    if (!capture || state.value !== 'live') return
    clearCameraNotice()
    const previousFacing = cameraFacing.value
    const nextFacing: CameraFacing = previousFacing === 'user' ? 'environment' : 'user'
    const version = ++requestVersion
    state.value = 'switching-camera'
    error.value = null
    liveStream.value = null

    try {
      const stream = await capture.openCamera(nextFacing, true)
      if (version !== requestVersion) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      cameraFacing.value = nextFacing
      storage.setItem(CAMERA_FACING_STORAGE_KEY, nextFacing)
      liveStream.value = stream
      state.value = 'live'
    } catch (caught) {
      if (version !== requestVersion) return
      if (!isCameraUnavailable(caught)) {
        failCameraRequest(caught)
        return
      }

      try {
        const restoredStream = await capture.openCamera(previousFacing)
        if (version !== requestVersion) {
          restoredStream.getTracks().forEach((track) => track.stop())
          return
        }
        liveStream.value = restoredStream
        state.value = 'live'
        showCameraNotice(
          `${cameraName(nextFacing)} camera isn’t available. Continuing with the ${cameraName(previousFacing).toLowerCase()} camera.`,
        )
      } catch (restoreError) {
        if (version !== requestVersion) return
        failCameraRequest(restoreError)
      }
    }
  }

  async function acceptPrivacy() {
    privacyAccepted.value = true
    storage.setItem(INTRO_STORAGE_KEY, 'true')
    await beginCamera()
  }

  function startRecording() {
    if (!capture || !liveStream.value || state.value !== 'live') return
    clearCameraNotice()
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
        cameraFacing: cameraFacing.value,
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
    clearCameraNotice()
    capture?.dispose()
    capture = null
    liveStream.value?.getTracks().forEach((track) => track.stop())
    liveStream.value = null
    releaseTake()
    if (resetToIntro) state.value = 'intro'
  }

  function failCameraRequest(caught: unknown) {
    cleanupSession(false)
    error.value = classifyCameraError(caught)
    state.value = 'error'
  }

  function showCameraNotice(message: string) {
    clearCameraNotice()
    cameraNotice.value = message
    noticeTimeoutId = scheduler.setTimeout(() => {
      cameraNotice.value = null
      noticeTimeoutId = null
    }, CAMERA_NOTICE_MS)
  }

  function clearCameraNotice() {
    if (noticeTimeoutId !== null) scheduler.clearTimeout(noticeTimeoutId)
    noticeTimeoutId = null
    cameraNotice.value = null
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
    cameraNotice: readonly(cameraNotice),
    elapsedMs: readonly(elapsedMs),
    privacyAccepted: readonly(privacyAccepted),
    cameraFacing: readonly(cameraFacing),
    canRecord,
    formattedElapsed,
    acceptPrivacy,
    beginCamera,
    switchCamera,
    startRecording,
    stopRecording,
    deleteTake,
    startNewTake,
    retryCamera,
    cleanupSession,
  }
}

function isCameraUnavailable(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'NotFoundError' || error.name === 'OverconstrainedError')
  )
}

function cameraName(facing: CameraFacing): 'Front' | 'Rear' {
  return facing === 'user' ? 'Front' : 'Rear'
}

export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
