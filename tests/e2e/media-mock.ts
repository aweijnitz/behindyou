import type { Page } from '@playwright/test'

export async function installMediaMock(page: Page, options: { denyFirst?: boolean } = {}) {
  await page.addInitScript(({ denyFirst }) => {
    const testState = { requests: 0, stoppedTracks: 0, recordings: 0, denyNext: !!denyFirst }
    Object.defineProperty(window, '__hairCheckerTest', { value: testState, configurable: true })

    const track = { stop: () => testState.stoppedTracks++ }
    const stream = { getTracks: () => [track] }
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async (constraints: MediaStreamConstraints) => {
          testState.requests++
          if ((constraints as { audio?: boolean }).audio !== false)
            throw new Error('Audio must be disabled')
          if (testState.denyNext) {
            testState.denyNext = false
            throw new DOMException('Denied for test', 'NotAllowedError')
          }
          return stream
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
        this.dispatchEvent(
          new BlobEvent('dataavailable', {
            data: new Blob(['temporary test video'], { type: this.mimeType }),
          }),
        )
        this.state = 'inactive'
        this.dispatchEvent(new Event('stop'))
      }
    }
    Object.defineProperty(window, 'MediaRecorder', { value: MockMediaRecorder, configurable: true })
  }, options)
}

declare global {
  interface Window {
    __hairCheckerTest: {
      requests: number
      stoppedTracks: number
      recordings: number
      denyNext: boolean
    }
  }
}
