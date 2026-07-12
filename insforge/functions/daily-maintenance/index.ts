import { createAdminClient } from 'npm:@insforge/sdk'

const MAX_BODY_BYTES = 2_048

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

function bearerToken(req: Request): string | null {
  const match = req.headers.get('Authorization')?.match(/^Bearer\s+([^\s]+)$/i)
  return match?.[1] ?? null
}

async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ])
  const leftBytes = new Uint8Array(leftDigest)
  const rightBytes = new Uint8Array(rightDigest)
  let difference = 0
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index]
  }
  return difference === 0 && left.length === right.length
}

export default async function (req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  // This endpoint is schedule-only; browsers never need to invoke it.
  if (req.headers.has('Origin')) return json({ error: 'Forbidden' }, 403)

  const configuredSecret = Deno.env.get('DAILY_MAINTENANCE_SECRET')?.trim()
  const suppliedSecret = bearerToken(req)
  if (!configuredSecret || !suppliedSecret || !(await constantTimeEqual(suppliedSecret, configuredSecret))) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const baseUrl = Deno.env.get('INSFORGE_BASE_URL')?.trim()
  const adminApiKey = Deno.env.get('INSFORGE_API_KEY')?.trim()
  if (!baseUrl || !adminApiKey) return json({ error: 'Maintenance is not configured' }, 503)

  const declaredLength = Number(req.headers.get('Content-Length') ?? '0')
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json({ error: 'Request body is too large' }, 413)
  }

  const rawBody = await req.text().catch(() => '')
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return json({ error: 'Request body is too large' }, 413)
  }

  let batchSize = 500
  if (rawBody.trim()) {
    try {
      const parsed = JSON.parse(rawBody) as { batchSize?: unknown }
      if (parsed.batchSize !== undefined) {
        if (!Number.isInteger(parsed.batchSize) || Number(parsed.batchSize) < 1 || Number(parsed.batchSize) > 5_000) {
          return json({ error: 'batchSize must be an integer from 1 to 5000' }, 400)
        }
        batchSize = Number(parsed.batchSize)
      }
    } catch {
      return json({ error: 'Request body must be valid JSON' }, 400)
    }
  }

  const admin = createAdminClient({
    baseUrl,
    apiKey: adminApiKey,
    timeout: 25_000,
    retryCount: 1,
  })
  const { data, error } = await admin.database.rpc('run_daily_maintenance', {
    p_batch_size: batchSize,
  })

  if (error) {
    console.error('daily-maintenance: RPC failed', error.message)
    return json({ error: 'Maintenance failed' }, 500)
  }

  return json({ ok: true, maintenance: data })
}
