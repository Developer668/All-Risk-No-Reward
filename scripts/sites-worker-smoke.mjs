import assert from 'node:assert/strict'
import { access, readFile, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const clientRoot = resolve(root, 'dist/client')
const serverEntry = resolve(root, 'dist/server/index.js')
const hostingEntry = resolve(root, 'dist/.openai/hosting.json')

await Promise.all([
  access(resolve(clientRoot, 'index.html')),
  access(resolve(clientRoot, 'manifest.webmanifest')),
  access(resolve(clientRoot, 'og.png')),
  access(resolve(clientRoot, 'sw.js')),
  access(serverEntry),
  access(hostingEntry),
])

await assert.rejects(
  access(resolve(root, 'dist/index.html')),
  undefined,
  'Static files must live in dist/client, not directly in dist.',
)

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.woff2', 'font/woff2'],
])

const assets = {
  async fetch(request) {
    const url = new URL(request.url)
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname
    const assetPath = resolve(clientRoot, `.${decodeURIComponent(pathname)}`)

    if (assetPath !== clientRoot && !assetPath.startsWith(`${clientRoot}${sep}`)) {
      return new Response('missing', { status: 404 })
    }

    try {
      if (!(await stat(assetPath)).isFile()) throw new Error('not a file')
      const headers = { 'Content-Type': mimeTypes.get(extname(assetPath)) ?? 'application/octet-stream' }
      return new Response(request.method === 'HEAD' ? null : await readFile(assetPath), { headers })
    } catch {
      return new Response('missing', { status: 404, headers: { 'Content-Type': 'text/plain' } })
    }
  },
}

const workerUrl = pathToFileURL(serverEntry)
workerUrl.searchParams.set('smoke', `${process.pid}-${Date.now()}`)
const { default: worker } = await import(workerUrl.href)

const rootDocument = await worker.fetch(new Request('https://all-risk.example/'), { ASSETS: assets })
assert.equal(rootDocument.status, 200)
assert.match(await rootDocument.text(), /<title>All Risk, No Reward<\/title>/)

const navigation = await worker.fetch(new Request('https://all-risk.example/app', {
  headers: { Accept: 'text/html', 'Sec-Fetch-Mode': 'navigate' },
}), { ASSETS: assets })
assert.equal(navigation.status, 200)
assert.match(await navigation.text(), /https:\/\/all-risk\.example\/og\.png/)
assert.equal(navigation.headers.get('x-content-type-options'), 'nosniff')

const indexHtml = await readFile(resolve(clientRoot, 'index.html'), 'utf8')
const assetPath = indexHtml.match(/src="(\/assets\/[^\"]+\.js)"/)?.[1]
assert.ok(assetPath, 'The client shell must reference a built JavaScript asset.')
const builtAsset = await worker.fetch(new Request(`https://all-risk.example${assetPath}`), { ASSETS: assets })
assert.equal(builtAsset.status, 200)
assert.match(builtAsset.headers.get('content-type') ?? '', /^text\/javascript\b/)
assert.equal(builtAsset.headers.get('cache-control'), 'public, max-age=31536000, immutable')

const missingAsset = await worker.fetch(new Request('https://all-risk.example/assets/missing.js'), { ASSETS: assets })
assert.equal(missingAsset.status, 404, 'Static asset 404s must not receive the SPA shell.')

const head = await worker.fetch(new Request('https://all-risk.example/privacy', {
  method: 'HEAD',
  headers: { Accept: 'text/html' },
}), { ASSETS: assets })
assert.equal(head.status, 200)
assert.equal(await head.text(), '')

console.log('Sites worker smoke test passed.')
