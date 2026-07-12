import { rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Remove the complete deployment tree so stale flat Vite output can never be
// packaged beside the Sites client/server convention.
await rm(resolve(root, 'dist'), { recursive: true, force: true })
