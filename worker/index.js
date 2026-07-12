const isDocumentNavigation = (request) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false

  const fetchMode = request.headers.get('sec-fetch-mode')
  if (fetchMode === 'navigate') return true

  return request.headers.get('accept')?.includes('text/html') ?? false
}

const addResponseHeaders = (response, pathname) => {
  const headers = new Headers(response.headers)
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()')

  if (pathname === '/sw.js') {
    headers.set('Cache-Control', 'public, max-age=0, must-revalidate')
    headers.set('Service-Worker-Allowed', '/')
  } else if (pathname === '/manifest.webmanifest') {
    headers.set('Cache-Control', 'public, max-age=3600')
  } else if (pathname.startsWith('/assets/')) {
    headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  }

  return headers
}

const finalizeResponse = async (response, request) => {
  const url = new URL(request.url)
  const headers = addResponseHeaders(response, url.pathname)
  const isHtml = headers.get('content-type')?.includes('text/html')

  if (!isHtml || request.method === 'HEAD') {
    return new Response(request.method === 'HEAD' ? null : response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }

  const html = (await response.text()).replaceAll('__SITE_ORIGIN__', url.origin)
  headers.set('Cache-Control', 'public, max-age=0, must-revalidate')
  headers.delete('Content-Encoding')
  headers.delete('Content-Length')
  return new Response(html, { status: response.status, statusText: response.statusText, headers })
}

export default {
  async fetch(request, env) {
    let response = await env.ASSETS.fetch(request)

    if (response.status === 404 && isDocumentNavigation(request)) {
      const indexUrl = new URL('/index.html', request.url)
      response = await env.ASSETS.fetch(new Request(indexUrl, request))
    }

    return finalizeResponse(response, request)
  },
}
