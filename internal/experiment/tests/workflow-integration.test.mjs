import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Context } from '../../../vendor/cordis/src/index.ts'
import { ExperimentStore } from '../index.mjs'
import { createWorkflow } from '../workflow.mjs'
import * as previewPlugin from '../preview-plugin.mjs'
import * as analyzerPlugin from '../analyzer-plugin.mjs'
import { LocalSandboxProvider } from '../../../packages/sandbox/sandbox-local/src/index.ts'
import LocalSubprocessRuntime from '../../../packages/subprocess/subprocess-local/src/index.ts'

const lab = resolve(import.meta.dirname, '../../../labscriptai-ot')
test('modified example protocol is analyzed and made available to its session', { timeout: 90000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workflow-integration-'))
  const store = new ExperimentStore({ path: join(dir, 'store.sqlite'), create: true })
  const ctx = new Context()
  let route
  ctx.provide('experimentStore', store)
  ctx.provide('connection', { fetch: { register(value) { route = value; return () => {} } } })
  const config = { flexRoot: join(lab, 'automation/flex3d'), python: join(lab, '.venv/bin/python'), temporaryRoot: dir, timeoutMs: 60000 }
  await ctx.plugin(LocalSandboxProvider, {})
  await ctx.plugin(LocalSubprocessRuntime)
  const preview = ctx.plugin(previewPlugin, config)
  const analyzer = ctx.plugin(analyzerPlugin, config)
  await Promise.all([preview.await(), analyzer.await()])
  const workflow = createWorkflow({ store, analyzer: ctx.get('protocolAnalyzer'), preview: ctx.get('experimentPreview') })
  try {
    const original = await readFile(new URL('../example_transfer.py', import.meta.url), 'utf8')
    const invalid = original.replace('opentrons_flex_96_tiprack_1000ul', 'nonexistent_flex_tiprack')
    assert.notEqual(invalid, original)
    await assert.rejects(ctx.get('protocolAnalyzer').analyze(invalid), /nonexistent_flex_tiprack/)
    const protocol = original.replace('模拟示例', '自定义模拟协议')
    const { experiment } = workflow.create({ sessionId: 's1', creationKey: 'one', requirement: 'local simulation', parameters: { assumptions: 'sample setup' }, protocol })
    const result = await workflow.analyze({ sessionId: 's1', id: experiment.id, revision: 1 })
    assert.equal(result.status, 'preview_ready')
    const status = await (await route.fetch(new Request('http://localhost/api/experiment-preview?resource=status&session=s1'))).json()
    assert.equal(status.id, experiment.id)
    const other = await (await route.fetch(new Request('http://localhost/api/experiment-preview?resource=status&session=s2'))).json()
    assert.equal(other.status, 'waiting')
  } finally {
    await workflow.close()
    await analyzer.dispose()
    await preview.dispose()
    await ctx.fiber.dispose()
    store.close()
    await rm(dir, { recursive: true, force: true })
  }
})
