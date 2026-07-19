import { vi } from 'vitest'

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverStub)

Object.defineProperties(HTMLMediaElement.prototype, {
  play: {
    configurable: true,
    value: vi.fn().mockImplementation(function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event('play'))
      return Promise.resolve()
    }),
  },
  pause: {
    configurable: true,
    value: vi.fn().mockImplementation(function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event('pause'))
    }),
  },
  load: { configurable: true, value: vi.fn() },
})
