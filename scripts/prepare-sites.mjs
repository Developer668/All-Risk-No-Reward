import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const hostingPath = resolve(root, '.openai/hosting.json')
const workerPath = resolve(root, 'worker/index.js')
const clientOutputPath = resolve(root, 'dist/client')
const clientIndexPath = resolve(clientOutputPath, 'index.html')
const serverOutputPath = resolve(root, 'dist/server/index.js')
const hostingOutputPath = resolve(root, 'dist/.openai/hosting.json')
const defaultSiteOrigin = 'https://all-risk-no-reward.decipherer71951502.chatgpt.site'

const hostingSource = await readFile(hostingPath, 'utf8')
const hosting = JSON.parse(hostingSource)
const expectedKeys = ['d1', 'project_id', 'r2']
const actualKeys = Object.keys(hosting).sort()

if (
  actualKeys.length !== expectedKeys.length ||
  !actualKeys.every((key, index) => key === expectedKeys[index])
) {
  throw new Error('.openai/hosting.json must contain only project_id, d1, and r2')
}

if (hosting.d1 !== null || hosting.r2 !== null) {
  throw new Error('This site does not use D1 or R2; both bindings must remain null')
}

for (const requiredClientFile of ['index.html', 'manifest.webmanifest', 'og.png', 'sw.js', '_headers', '_redirects']) {
  await access(resolve(clientOutputPath, requiredClientFile))
}

const configuredOrigin = process.env.SITE_ORIGIN?.trim() || defaultSiteOrigin
const parsedOrigin = new URL(configuredOrigin)
if (parsedOrigin.protocol !== 'https:' || parsedOrigin.origin !== configuredOrigin) {
  throw new Error('SITE_ORIGIN must be an HTTPS origin with no path, query, or fragment')
}
const clientHtml = await readFile(clientIndexPath, 'utf8')
if (!clientHtml.includes('__SITE_ORIGIN__')) {
  throw new Error('The client shell is missing the __SITE_ORIGIN__ metadata placeholder')
}
await writeFile(clientIndexPath, clientHtml.replaceAll('__SITE_ORIGIN__', configuredOrigin))

await mkdir(resolve(root, 'dist/server'), { recursive: true })
await mkdir(resolve(root, 'dist/.openai'), { recursive: true })
await writeFile(serverOutputPath, await readFile(workerPath, 'utf8'))
await writeFile(hostingOutputPath, `${JSON.stringify(hosting, null, 2)}\n`)
