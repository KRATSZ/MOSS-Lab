import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPluginClient } from '../plugin-client.mjs'

test('does not spawn the MCP server when confinement is unavailable and cleans up input', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'analyzer-denied-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const client = createPluginClient({ data: directory, root: '/missing-plugin', dependencyHome: '/dependencies', version: '0.1.3', timeoutMs: 150000,
    sandbox: { async confine() { throw new Error('sandbox unavailable') } } })
  await assert.rejects(client.analyze('def run(protocol): pass'), /sandbox unavailable/)
  assert.deepEqual(await readdir(directory), [])
})
