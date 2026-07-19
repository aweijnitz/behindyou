import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.vue'

class AppMediaRecorder extends EventTarget {
  static isTypeSupported = () => true
  state: RecordingState = 'inactive'
  mimeType = 'video/mp4'
  start() {
    this.state = 'recording'
  }
  stop() {
    this.dispatchEvent(new BlobEvent('dataavailable', { data: new Blob(['video']) }))
    this.state = 'inactive'
    this.dispatchEvent(new Event('stop'))
  }
}

describe('App', () => {
  const track = { stop: vi.fn() }
  const stream = { getTracks: () => [track] }

  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('MediaRecorder', AppMediaRecorder)
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => stream) },
    })
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:app-take'),
    })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  })

  it('explains privacy before requesting the camera', () => {
    const wrapper = mount(App)
    expect(wrapper.get('h1').text()).toContain('Check your hair')
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('completes the main record, review, delete workflow', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    await wrapper.get('[data-testid="accept-privacy"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[aria-label="Mirrored live camera preview"]').classes()).toContain(
      'mirrored',
    )
    await wrapper.get('[data-testid="record-button"]').trigger('click')
    expect(wrapper.text()).toContain('Turn slowly')
    await wrapper.get('[data-testid="stop-button"]').trigger('click')
    await flushPromises()
    const video = wrapper.get<HTMLVideoElement>('[aria-label="Mirrored recorded hair check"]')
    expect(video.attributes('src')).toBe('blob:app-take')
    Object.defineProperty(video.element, 'duration', { configurable: true, value: 4 })
    Object.defineProperty(video.element, 'currentTime', {
      configurable: true,
      writable: true,
      value: 1,
    })
    await video.trigger('loadedmetadata')
    await video.trigger('durationchange')
    await video.trigger('timeupdate')
    await wrapper.get('[data-testid="play-pause"]').trigger('click')
    Object.defineProperty(video.element, 'paused', { configurable: true, value: false })
    await wrapper.get('[data-testid="play-pause"]').trigger('click')
    await video.trigger('ended')
    await wrapper.get('[data-testid="delete-take"]').trigger('click')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:app-take')
    expect(wrapper.get('[data-testid="resume-camera"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('skips the privacy explanation after it has already been accepted', async () => {
    localStorage.setItem('hair-checker:privacy-intro-seen:v1', 'true')
    const wrapper = mount(App)
    await flushPromises()
    expect(wrapper.get('[data-testid="record-button"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows a recoverable permission error', async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(
      new DOMException('', 'NotAllowedError'),
    )
    const wrapper = mount(App)
    await wrapper.get('[data-testid="accept-privacy"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Camera access is off')
    expect(wrapper.get('[data-testid="retry-camera"]').exists()).toBe(true)
    wrapper.unmount()
  })
})
