import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const distDirectory = join(projectRoot, 'dist')
const assetsDirectory = join(distDirectory, 'assets')
const serviceWorkerPath = join(distDirectory, 'sw.js')

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(directory, entry.name)
      return entry.isDirectory() ? listFiles(fullPath) : [fullPath]
    }),
  )
  return files.flat()
}

const buildFiles = (await listFiles(distDirectory)).sort()
const assetFiles = (await listFiles(assetsDirectory)).sort()
const hasher = createHash('sha256')

for (const file of buildFiles) {
  hasher.update(relative(distDirectory, file))
  hasher.update(await readFile(file))
}

const version = hasher.digest('hex').slice(0, 12)
const assetUrls = assetFiles.map((file) => `/${relative(distDirectory, file).split(sep).join('/')}`)
const injectedAssets = assetUrls.map((url) => `  ${JSON.stringify(url)},`).join('\n')
const source = await readFile(serviceWorkerPath, 'utf8')

if (!source.includes('  /*__BUILD_ASSETS__*/') || !source.includes('__BUILD_VERSION__')) {
  throw new Error('Service worker injection markers are missing.')
}

const generated = source
  .replace('  /*__BUILD_ASSETS__*/', injectedAssets)
  .replaceAll('__BUILD_VERSION__', version)

await writeFile(serviceWorkerPath, generated)
console.log(`Generated offline cache ${version} with ${assetUrls.length} build assets.`)
