import { spawn, spawnSync } from 'node:child_process'

const testScripts = process.argv.slice(2)
if (testScripts.length === 0) testScripts.push('scripts/runtime-audit.mjs')
const baseUrl = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173'
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const detached = process.platform !== 'win32'
const npmCli = process.env.npm_execpath

// Node 24 on Windows can reject direct .cmd spawning with EINVAL. When npm
// exposes its JavaScript entry point, launch that through the current Node
// executable so the verification suite behaves the same across platforms.
const preview = npmCli
  ? spawn(process.execPath, [npmCli, 'run', 'preview'], {
    detached,
    env: { ...process.env, E2E_BASE_URL: baseUrl },
    stdio: 'inherit',
  })
  : spawn(npmCommand, ['run', 'preview'], {
  detached,
  env: { ...process.env, E2E_BASE_URL: baseUrl },
  stdio: 'inherit',
})

let stopping = false

function stopPreview() {
  if (stopping || preview.exitCode !== null) return
  stopping = true
  if (process.platform === 'win32' && preview.pid) {
    spawnSync('taskkill.exe', ['/pid', String(preview.pid), '/t', '/f'], { stdio: 'ignore' })
    return
  }
  if (detached && preview.pid) {
    try {
      process.kill(-preview.pid, 'SIGTERM')
      return
    } catch {
      // Fall through to killing the direct child.
    }
  }
  preview.kill('SIGTERM')
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    stopPreview()
    process.exitCode = 130
  })
}

async function waitForServer(timeoutMs = 30_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (preview.exitCode !== null) throw new Error(`Preview server exited with code ${preview.exitCode}.`)
    try {
      const response = await fetch(baseUrl, { redirect: 'manual' })
      if (response.status < 500) return
    } catch {
      // The preview server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Preview server did not become ready at ${baseUrl} within ${timeoutMs / 1000}s.`)
}

function runTest(testScript) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [testScript], {
      env: { ...process.env, E2E_BASE_URL: baseUrl },
      stdio: 'inherit',
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${testScript} failed${signal ? ` with ${signal}` : ` with code ${code}`}.`))
    })
  })
}

try {
  await waitForServer()
  for (const testScript of testScripts) {
    await runTest(testScript)
  }
} finally {
  stopPreview()
}
