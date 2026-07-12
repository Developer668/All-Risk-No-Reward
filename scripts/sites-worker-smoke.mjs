import assert from 'node:assert/strict'
import worker from '../worker/index.js'

const html = '<!doctype html><meta property="og:image" content="__SITE_ORIGIN__/og.png"><main>app</main>'
const assets = {
  async fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(request.method === 'HEAD' ? null : html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    }
    return new Response('missing', { status: 404, headers: { 'Content-Type': 'text/plain' } })
  },
}

const navigation = await worker.fetch(new Request('https://all-risk.example/app', {
  headers: { Accept: 'text/html', 'Sec-Fetch-Mode': 'navigate' },
}), { ASSETS: assets })
assert.equal(navigation.status, 200)
assert.match(await navigation.text(), /https:\/\/all-risk\.example\/og\.png/)
assert.equal(navigation.headers.get('x-content-type-options'), 'nosniff')

const missingAsset = await worker.fetch(new Request('https://all-risk.example/assets/missing.js'), { ASSETS: assets })
assert.equal(missingAsset.status, 404, 'Static asset 404s must not receive the SPA shell.')

const head = await worker.fetch(new Request('https://all-risk.example/privacy', {
  method: 'HEAD',
  headers: { Accept: 'text/html' },
}), { ASSETS: assets })
assert.equal(head.status, 200)
assert.equal(await head.text(), '')

console.log('Sites worker smoke test passed.')
