/** Exercise the exact pinned runtime through public MCP tools; never uses a model or robot. */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Context } from '../vendor/cordis/src/index.ts'
import { LocalSandboxProvider } from '../packages/sandbox/sandbox-local/src/index.ts'
import { createPluginClient } from '../internal/experiment/plugin-client.mjs'
import { ensurePluginRuntime } from './labscriptai-runtime.mjs'

const runtime = await ensurePluginRuntime(process.cwd())
const ctx = new Context()
try {
  await ctx.plugin(LocalSandboxProvider, {}).await()
  const client = createPluginClient({ ...runtime, timeoutMs: 300000, sandbox: ctx.sandbox })
  const protocol = await readFile(new URL('../internal/experiment/example_transfer.py', import.meta.url), 'utf8')
  const analysis = await client.analyze(protocol)
  const documents = await client.documents(analysis)
  assert.ok(documents.animation?.length > 1000, 'animation document unavailable')
  assert.ok(documents.setup?.length > 1000, 'setup document unavailable')
  assert.ok(documents.files.some(file => file.name === 'wells.csv'))
  assert.ok(documents.files.some(file => file.name === 'setup.png'))
  assert.doesNotMatch(documents.setup.toString(), /<script>/)
  console.log(JSON.stringify({ ok: true, version: runtime.version, revision: runtime.revision, artifact_api: runtime.artifact_api,
    animation_bytes: documents.animation.length, setup_bytes: documents.setup.length }))
} finally {
  await ctx.fiber.dispose()
}
