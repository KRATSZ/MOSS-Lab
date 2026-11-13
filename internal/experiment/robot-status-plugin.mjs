import { setTimeout as delay } from 'node:timers/promises'

export const name = 'robot-status'
export const inject = ['connection']

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function safeText(value, secrets) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_ .-]{1,100}$/.test(value) || /\b\d{1,3}(?:\.\d{1,3}){3}\b/.test(value)) return null
  const lower = value.toLowerCase()
  return secrets.some(secret => secret && lower.includes(secret.toLowerCase())) ? null : value
}

function healthResult(payload, secrets) {
  const data = object(payload) && 'data' in payload ? payload.data : payload
  if (!object(data)) return null
  return {
    status: safeText(data.status, secrets),
    robotModel: safeText(data.robot_model ?? data.robotModel, secrets),
  }
}

function instrumentsResult(payload, secrets) {
  const data = object(payload) && 'data' in payload ? payload.data : payload
  if (!Array.isArray(data)) return null
  const result = []
  for (const item of data) {
    if (!object(item) || !['left', 'right'].includes(item.mount)) return null
    result.push({ mount: item.mount, name: safeText(item.instrumentName ?? item.name ?? item.model ?? item.instrumentModel, secrets) })
  }
  return result
}

const transient = new Set(['ECONNRESET', 'ETIMEDOUT', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT'])

async function readJson(url, headers, deadline, maxBytes, signal) {
  for (let attempt = 0; attempt < 3 && !signal.aborted; attempt++) {
    const remaining = Math.floor(deadline - performance.now())
    if (remaining < 1) break
    const local = new AbortController()
    const timeout = AbortSignal.timeout(Math.ceil(remaining / (3 - attempt)))
    const scope = AbortSignal.any([signal, timeout, local.signal])
    let retry = false
    try {
      const response = await fetch(url, { method: 'GET', headers, redirect: 'error', signal: scope })
      if (response.ok && response.body) {
        const chunks = []
        let size = 0
        for await (const chunk of response.body) {
          size += chunk.byteLength
          if (size > maxBytes) return null
          chunks.push(chunk)
        }
        return JSON.parse(Buffer.concat(chunks, size).toString('utf8'))
      }
      retry = [502, 503, 504].includes(response.status)
    } catch (error) {
      retry = timeout.aborted || transient.has(error.cause?.code ?? error.code)
    } finally {
      local.abort()
    }
    if (!retry || attempt === 2 || signal.aborted) break
    const wait = Math.min(150, Math.floor((deadline - performance.now()) / 4))
    if (wait > 0) await delay(wait, undefined, { signal }).catch(() => {})
  }
  return null
}

/**
 * Register GET /api/robot-status on the authenticated connection carrier.
 * The response has status (not_configured, unreachable, partial, or ready),
 * queriedAt (ISO 8601), health ({ status, robotModel } or null), and
 * instruments (array of { mount, name } or null). Null fields are unavailable;
 * an empty instruments array means the query succeeded with no instruments.
 * The environment target is read once, and failures never expose its value.
 */
export function apply(ctx, config) {
  if (!config || !Number.isSafeInteger(config.timeoutMs) || config.timeoutMs <= 0 || !Number.isSafeInteger(config.maxBytes) || config.maxBytes <= 0) throw new Error('robot-status requires positive timeoutMs and maxBytes')
  const configuredUrl = process.env.OPENTRONS_URL
  const configured = typeof configuredUrl === 'string' && configuredUrl.trim() !== ''
  let target = null
  const headers = { 'Opentrons-Version': '4', Accept: 'application/json' }
  const secrets = []
  if (configured) {
    try {
      const parsed = new URL(configuredUrl)
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('invalid protocol')
      secrets.push(parsed.hostname, decodeURIComponent(parsed.username), decodeURIComponent(parsed.password), ...parsed.searchParams.values())
      if (parsed.username || parsed.password) headers.Authorization = `Basic ${Buffer.from(`${decodeURIComponent(parsed.username)}:${decodeURIComponent(parsed.password)}`).toString('base64')}`
      parsed.username = ''
      parsed.password = ''
      target = parsed.origin
    } catch (error) {
      // Invalid configuration is reported as unreachable without exposing its value.
    }
  }
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/robot-status',
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: async request => {
      const queriedAt = new Date().toISOString()
      let health = null
      let instruments = null
      if (target) {
        const started = performance.now()
        const deadline = started + config.timeoutMs
        const signal = AbortSignal.any([request.signal, AbortSignal.timeout(config.timeoutMs)])
        health = healthResult(await readJson(new URL('/health', target), headers, started + config.timeoutMs / 2, config.maxBytes, signal), secrets)
        instruments = instrumentsResult(await readJson(new URL('/instruments', target), headers, deadline, config.maxBytes, signal), secrets)
      }
      const status = !configured ? 'not_configured' : health && instruments ? 'ready' : health || instruments ? 'partial' : 'unreachable'
      return Response.json({ status, queriedAt, health, instruments }, { headers: { 'Cache-Control': 'private, no-store' } })
    },
  }), 'robot-status.route')
}
