import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '../../../vendor/cordis/src/index.ts'
import { LocalSandboxProvider } from '../../../packages/sandbox/sandbox-local/src/index.ts'
import { ensurePluginRuntime } from '../../../scripts/labscriptai-runtime.mjs'
import { ExperimentStore } from '../index.mjs'
import { createPluginClient } from '../plugin-client.mjs'
import { createWorkflow } from '../workflow.mjs'
import * as plugin from '../robot-control-plugin.mjs'

test('the public MCP adapter controls loopback Flex and OT-2 through a saved, approved revision', { timeout: 120000 }, async t => {
  const runtime = await ensurePluginRuntime(process.cwd())
  const directory = await mkdtemp(join(tmpdir(), 'moss-robot-mcp-'))
  const ctx = new Context()
  await ctx.plugin(LocalSandboxProvider, {}).await()
  const client = createPluginClient({ ...runtime, data: directory, sandbox: ctx.sandbox, timeoutMs: 300000 })
  const store = new ExperimentStore({ path: join(directory, 'experiments.sqlite'), create: true })
  t.after(async () => { await ctx.fiber.dispose(); store.close(); await rm(directory, { recursive: true, force: true }) })
  const workflow = createWorkflow({ store, analyzer: client, preview: { async prepare() {} } })
  const credentials = 'Basic ' + Buffer.from('moss:loopback-test').toString('base64')

  for (const [robotType, fixture] of [['Flex', '../example_transfer.py'], ['OT-2', './example_ot2_transfer.py']]) {
    await t.test(robotType, async t => {
      const serial = robotType === 'Flex' ? 'FLEX-1' : 'OT2-1'
      let state = 'idle'
      let uploadKey
      let dropCreateReply = false
      const mutations = []
      const server = createServer((request, response) => {
        const path = new URL(request.url, 'http://localhost').pathname
        const send = (data, status = 200) => {
          response.writeHead(status, { 'content-type': 'application/json' })
          response.end(JSON.stringify(data))
        }
        if (request.headers.authorization !== credentials) return send({}, 401)
        if (request.method === 'POST') {
          mutations.push(path)
          if (path === '/protocols') {
            const chunks = []
            request.on('data', chunk => chunks.push(chunk))
            request.on('end', () => {
              uploadKey = Buffer.concat(chunks).toString().match(/name="key"\r\n\r\n([a-f0-9-]+)/)?.[1]
              send({ data: { id: 'protocol-1' } })
            })
            return
          }
          if (path === '/runs') {
            state = 'idle'
            if (dropCreateReply) return request.socket.destroy()
            return send({ data: { id: 'run-1' } })
          }
          if (path === '/runs/run-1/actions') {
            const chunks = []
            request.on('data', chunk => chunks.push(chunk))
            request.on('end', () => {
              const { data } = JSON.parse(Buffer.concat(chunks))
              state = { play: 'running', pause: 'paused', stop: 'stopped' }[data.actionType]
              send({ data: { id: 'action-1' } })
            })
            return
          }
        }
        if (path === '/health') return send({ robot_model: robotType === 'Flex' ? 'OT-3 Standard' : 'OT-2 Standard', robot_serial: serial })
        if (path === '/robot/door/status') return send({ data: { status: 'closed' } })
        if (path === '/robot/control/estopStatus') return robotType === 'OT-2' ? send({}, 404) : send({ data: { status: 'disengaged' } })
        if (path === '/deck_configuration') return robotType === 'OT-2' ? send({}, 404) : send({ data: { cutoutFixtures: [] } })
        if (path === '/protocols') return send({ data: [{ id: 'protocol-1', key: uploadKey }] })
        if (path === '/runs') return send({ data: [{ id: 'run-1', protocolId: 'protocol-1' }] })
        if (path === '/runs/run-1') return send({ data: { id: 'run-1', status: state, labware: [] } })
        if (['/instruments', '/modules', '/labwareOffsets', '/runs/run-1/commands'].includes(path)) return send({ data: [] })
        return send({}, 404)
      })
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
      t.after(() => { server.closeAllConnections(); server.close() })
      let control
      plugin.apply({
        experimentStore: store, labscriptaiRuntime: client, get() {},
        effect(fn) { fn() }, provide(_, value) { control = value },
      }, { url: `http://moss:loopback-test@127.0.0.1:${server.address().port}`, allowLive: true })
      const sessionId = robotType
      const protocol = await readFile(new URL(fixture, import.meta.url), 'utf8')
      const { experiment } = workflow.create({ sessionId, creationKey: 'transfer', requirement: 'Transfer water', parameters: {}, protocol })
      await workflow.analyze({ sessionId, id: experiment.id, revision: 1 })
      const { robot, analysis } = await control.verifyStart(sessionId, experiment.id, 1)
      assert.equal(robot.serial, serial)
      const result = await control.startRun({ sessionId, experimentId: experiment.id, revision: 1, approved: { ...robot, taskId: analysis.taskId } })
      assert.equal(result.status, 'start_acknowledged', JSON.stringify(result))
      assert.deepEqual(mutations, ['/protocols', '/runs', '/runs/run-1/actions'])
      for (const [action, expected] of [['pause', 'paused'], ['resume', 'running'], ['stop', 'stopped']]) {
        assert.equal((await control.controlRun({ sessionId, id: result.id, action, approved: result.id })).status, 'action_acknowledged')
        assert.equal((await control.getRun(sessionId, result.id)).status, expected)
      }
      assert.equal(control.activeRun(sessionId), null)
      if (robotType === 'OT-2') {
        dropCreateReply = true
        const unknown = await control.startRun({ sessionId, experimentId: experiment.id, revision: 1, approved: { ...robot, taskId: analysis.taskId } })
        assert.equal(unknown.status, 'preparation_unconfirmed')
        assert.equal(uploadKey, unknown.id)
        assert.equal((await control.getRun(sessionId, unknown.id)).status, 'idle')
        assert.equal((await control.controlRun({ sessionId, id: unknown.id, action: 'stop' })).status, 'action_acknowledged')
        assert.equal((await control.getRun(sessionId, unknown.id)).status, 'stopped')
      }
    })
  }
})
