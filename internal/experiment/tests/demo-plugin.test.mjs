import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '../../../vendor/cordis/src/index.ts'
import * as plugin from '../demo-plugin.mjs'
import * as analyzerPlugin from '../analyzer-plugin.mjs'


test('publishes a labeled demo and removes its temporary data on disposal', { timeout: 90000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'demo-plugin-test-'))
  const ctx = new Context()
  let route
  ctx.provide('connection', { fetch: { register(value) { route = value; return () => { route = undefined } } } })
  ctx.provide('labscriptaiRuntime', { analyze: async () => Buffer.from('{}'), documents: async () => ({ animation: Buffer.from('<html>demo</html>'), setup: Buffer.from('<html>setup</html>'), files: [] }) })
  const config = { temporaryRoot: directory, timeoutMs: 60000 }
  const analyzer = ctx.plugin(analyzerPlugin, config)
  await analyzer.await()
  const fiber = ctx.plugin(plugin, config)
  try {
    await fiber.await()
    const status = await (await route.fetch(new Request('http://localhost/api/experiment-demo?resource=status'))).json()
    assert.equal(status.status, 'ready')
    const params = new URLSearchParams({ id: status.id, revision: String(status.revision), session: 'demo', task: status.task, resource: 'animation' })
    assert.equal(await (await route.fetch(new Request(`http://localhost/api/experiment-demo?${params}`))).text(), '<html>demo</html>')
    params.set('resource', 'setup')
    assert.equal(await (await route.fetch(new Request(`http://localhost/api/experiment-demo?${params}`))).text(), '<html>setup</html>')
  } finally {
    await fiber.dispose()
    await ctx.fiber.dispose()
    assert.deepEqual(await readdir(directory), [])
    await rm(directory, { recursive: true, force: true })
  }
  assert.equal(route, undefined)
})
