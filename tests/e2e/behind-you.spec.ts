import { expect, test } from '@playwright/test'
import { installMediaMock } from './media-mock'

test.beforeEach(async ({ page }) => {
  await installMediaMock(page)
})

test('records, reviews, scrubs, and deletes a temporary take', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /check your hair/i })).toBeVisible()
  await page.getByTestId('accept-privacy').click()
  await expect(page.getByLabel('Live camera preview')).toBeVisible()
  await expect(page.getByLabel('Live camera preview')).toHaveClass(/mirrored/)

  await page.getByTestId('record-button').click()
  await expect(page.getByText(/turn slowly/i)).toBeVisible()
  await expect(page.getByTestId('switch-camera')).toHaveCount(0)
  await page.waitForTimeout(150)
  await page.getByTestId('stop-button').click()

  await expect(page.getByText('Review your hair')).toBeVisible()
  await expect(page.getByRole('slider', { name: 'Video position' })).toBeVisible()
  await page.getByRole('slider', { name: 'Video position' }).press('ArrowRight')
  await page.getByTestId('play-pause').click()
  await page.getByTestId('delete-take').click()

  await expect(page.getByRole('heading', { name: /ready for another check/i })).toBeVisible()
  const state = await page.evaluate(() => window.__behindYouTest)
  expect(state.requests).toBe(1)
  expect(state.recordings).toBe(1)
  expect(state.stoppedTracks).toBeGreaterThan(0)
})

test('starting a new take destroys the previous one and reacquires the camera', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByTestId('accept-privacy').click()
  await page.getByTestId('record-button').click()
  await page.getByTestId('stop-button').click()
  await expect(page.getByTestId('new-take')).toBeVisible()
  await page.getByTestId('new-take').click()
  await expect(page.getByTestId('record-button')).toBeVisible()
  expect(await page.evaluate(() => window.__behindYouTest.requests)).toBe(2)
})

test('cleans up transient media when the page is closed or backgrounded', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('accept-privacy').click()
  await page.getByTestId('record-button').click()
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide'))
  })
  await expect(page.getByTestId('resume-camera')).toBeVisible()
  expect(await page.evaluate(() => window.__behindYouTest.stoppedTracks)).toBeGreaterThan(0)
})

test('sends no video or third-party network request', async ({ page }) => {
  const requests: Array<{ method: string; url: string }> = []
  page.on('request', (request) => requests.push({ method: request.method(), url: request.url() }))
  await page.goto('/')
  await page.getByTestId('accept-privacy').click()
  await page.getByTestId('record-button').click()
  await page.getByTestId('stop-button').click()
  await expect(page.getByText('Review your hair')).toBeVisible()

  expect(requests.every(({ method }) => method === 'GET')).toBe(true)
  const httpRequests = requests.filter(({ url }) => url.startsWith('http'))
  expect(httpRequests.every(({ url }) => new URL(url).origin === 'http://127.0.0.1:4173')).toBe(
    true,
  )
})

test('switches cameras, preserves orientation in review, and persists the preference', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByTestId('accept-privacy').click()
  const liveVideo = page.getByLabel('Live camera preview')
  await expect(liveVideo).toHaveClass(/mirrored/)
  await page.getByTestId('switch-camera').click()
  await expect(page.getByLabel('Switch to front camera')).toBeVisible()
  await expect(liveVideo).not.toHaveClass(/mirrored/)
  expect(await page.evaluate(() => window.__behindYouTest.facings)).toEqual(['user', 'environment'])

  await page.getByTestId('record-button').click()
  await page.getByTestId('stop-button').click()
  await expect(page.getByLabel('Recorded hair check')).not.toHaveClass(/mirrored/)
  await page.getByTestId('new-take').click()
  await expect(page.getByLabel('Switch to front camera')).toBeVisible()
  expect(await page.evaluate(() => window.__behindYouTest.facings.at(-1))).toBe('environment')

  await page.reload()
  await expect(page.getByTestId('record-button')).toBeVisible()
  await expect(page.getByLabel('Switch to front camera')).toBeVisible()
  expect(await page.evaluate(() => window.__behindYouTest.facings.at(-1))).toBe('environment')
})

test('restores the front camera when the rear camera is unavailable', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('accept-privacy').click()
  await page.evaluate(() => {
    window.__behindYouTest.unavailableFacing = 'environment'
  })
  await page.getByTestId('switch-camera').click()
  await expect(page.getByText(/rear camera isn’t available/i)).toBeVisible()
  await expect(page.getByLabel('Switch to rear camera')).toBeVisible()
  await expect(page.getByLabel('Live camera preview')).toHaveClass(/mirrored/)
  expect(await page.evaluate(() => window.__behindYouTest.facings)).toEqual([
    'user',
    'environment',
    'user',
  ])
})

test('shows a useful permission error and retries', async ({ page }) => {
  await page.evaluate(() => localStorage.clear()).catch(() => {})
  await page.goto('/')
  await page.evaluate(() => {
    window.__behindYouTest.denyNext = true
  })
  await page.getByTestId('accept-privacy').click()
  await expect(page.getByText(/camera access is off/i)).toBeVisible()
  await page.getByTestId('retry-camera').click()
  await expect(page.getByTestId('record-button')).toBeVisible()
})

test('manifest is installable and the cached shell reloads offline', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Playwright service-worker inspection is Chromium-only')
  await page.goto('/')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await expect
    .poll(async () => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true)
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(manifestHref).toBeTruthy()
  const manifest = (await page.evaluate(
    async (href) => fetch(href!).then((response) => response.json()),
    manifestHref,
  )) as { name: string; display: string }
  expect(manifest.name).toBe('Behind You')
  expect(manifest.display).toBe('standalone')

  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('main')).toBeVisible()
  await context.setOffline(false)
})
