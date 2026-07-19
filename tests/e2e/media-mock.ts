import type { Page } from '@playwright/test'

export async function installMediaMock(page: Page, options: { denyFirst?: boolean } = {}) {
  await page.addInitScript(({ denyFirst }) => {
    const testState = {
      requests: 0,
      stoppedTracks: 0,
      recordings: 0,
      denyNext: !!denyFirst,
      unavailableFacing: null as 'user' | 'environment' | null,
      facings: [] as Array<'user' | 'environment'>,
    }
    Object.defineProperty(window, '__behindYouTest', { value: testState, configurable: true })

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async (constraints: MediaStreamConstraints) => {
          testState.requests++
          if ((constraints as { audio?: boolean }).audio !== false)
            throw new Error('Audio must be disabled')
          const facingConstraint = (constraints.video as MediaTrackConstraints).facingMode
          const facingOptions =
            facingConstraint &&
            typeof facingConstraint === 'object' &&
            !Array.isArray(facingConstraint)
              ? facingConstraint
              : undefined
          const requested =
            typeof facingConstraint === 'string'
              ? facingConstraint
              : Array.isArray(facingConstraint)
                ? facingConstraint[0]
                : Array.isArray(facingOptions?.exact)
                  ? facingOptions.exact[0]
                  : (facingOptions?.exact ??
                    (Array.isArray(facingOptions?.ideal)
                      ? facingOptions.ideal[0]
                      : facingOptions?.ideal))
          const facing = requested === 'environment' ? 'environment' : 'user'
          testState.facings.push(facing)
          if (testState.denyNext) {
            testState.denyNext = false
            throw new DOMException('Denied for test', 'NotAllowedError')
          }
          if (testState.unavailableFacing === facing) {
            throw new DOMException('Camera unavailable for test', 'OverconstrainedError')
          }
          const track = { stop: () => testState.stoppedTracks++ }
          return { getTracks: () => [track] }
        },
      },
    })

    class MockMediaRecorder extends EventTarget {
      static isTypeSupported(type: string) {
        return type.startsWith('video/')
      }
      state: RecordingState = 'inactive'
      mimeType: string
      constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
        super()
        this.mimeType = options?.mimeType ?? 'video/mp4'
      }
      start() {
        this.state = 'recording'
        testState.recordings++
      }
      stop() {
        if (this.state === 'inactive') return
        // Playwright's Linux WebKit build does not expose BlobEvent even though
        // iOS Safari does. A plain Event with the same data property exercises
        // our MediaRecorder integration without depending on that constructor.
        const dataEvent = new Event('dataavailable') as BlobEvent
        Object.defineProperty(dataEvent, 'data', {
          value: new Blob(['temporary test video'], { type: this.mimeType }),
        })
        this.dispatchEvent(dataEvent)
        this.state = 'inactive'
        this.dispatchEvent(new Event('stop'))
      }
    }
    Object.defineProperty(window, 'MediaRecorder', { value: MockMediaRecorder, configurable: true })
  }, options)
}

declare global {
  interface Window {
    __behindYouTest: {
      requests: number
      stoppedTracks: number
      recordings: number
      denyNext: boolean
      unavailableFacing: 'user' | 'environment' | null
      facings: Array<'user' | 'environment'>
    }
  }
}
