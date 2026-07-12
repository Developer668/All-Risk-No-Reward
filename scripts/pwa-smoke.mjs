import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseUrl = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173'
const browser = await chromium.launch({ headless: true })

try {
  const context = await browser.newContext()
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  const response = await page.goto(baseUrl, { waitUntil: 'networkidle' })
  assert.equal(response?.ok(), true, 'The app shell did not load.')

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
  assert.equal(manifestHref, '/manifest.webmanifest', 'The web app manifest is not linked.')

  const manifestResponse = await page.request.get(`${baseUrl}/manifest.webmanifest`)
  assert.equal(manifestResponse.ok(), true, 'The web app manifest is not available.')
  const manifest = await manifestResponse.json()
  assert.equal(manifest.name, 'All Risk, No Reward')
  assert.equal(manifest.display, 'standalone')
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192'), 'The manifest needs a 192px icon.')
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512'), 'The manifest needs a 512px icon.')
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'), 'The manifest needs a maskable icon.')

  for (const icon of manifest.icons) {
    const iconResponse = await page.request.get(new URL(icon.src, baseUrl).href)
    assert.equal(iconResponse.ok(), true, `Manifest icon is unavailable: ${icon.src}`)
  }

  const serviceWorkerResponse = await page.request.get(`${baseUrl}/sw.js`)
  assert.equal(serviceWorkerResponse.ok(), true, 'The service worker script is not available.')
  const serviceWorkerSource = await serviceWorkerResponse.text()
  assert.equal(serviceWorkerSource.includes('__BUILD_'), false, 'The service worker build markers were not replaced.')

  const registration = await page.evaluate(async () => {
    const ready = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Service worker readiness timed out.')), 10_000)),
    ])
    return { active: Boolean(ready.active), scope: ready.scope }
  })
  assert.equal(registration.active, true, 'The service worker did not activate.')
  assert.equal(registration.scope, new URL('/', baseUrl).href, 'The service worker does not own the app scope.')

  await page.reload({ waitUntil: 'networkidle' })
  assert.equal(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), true, 'The service worker did not take control.')

  const cacheState = await page.evaluate(async () => {
    const names = await caches.keys()
    const entries = (await Promise.all(names.map(async (name) => (await caches.open(name)).keys()))).flat()
    return {
      names,
      urls: entries.map((request) => new URL(request.url).pathname),
    }
  })
  assert.ok(cacheState.names.some((name) => name.startsWith('all-risk-static-')), 'The static offline cache is missing.')
  assert.ok(cacheState.urls.includes('/index.html'), 'The app shell was not cached.')
  assert.ok(cacheState.urls.some((url) => url.startsWith('/assets/')), 'Built assets were not precached.')

  await context.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 15_000 })
  const offlineShellVisible = await page.locator('#root, main').first().isVisible()
  assert.equal(offlineShellVisible, true, 'No app or fallback shell was available offline.')
  assert.deepEqual(pageErrors, [], `Page errors occurred: ${pageErrors.join('; ')}`)

  console.log(
    JSON.stringify(
      {
        manifest: 'valid',
        serviceWorker: 'active',
        cachedEntries: cacheState.urls.length,
        offlineReload: 'passed',
      },
      null,
      2,
    ),
  )
} finally {
  await browser.close()
}
