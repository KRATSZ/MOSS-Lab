import test from 'node:test'
import assert from 'node:assert/strict'
import { createCompletionNotifier } from './completion-notifier.mjs'

const tick = () => new Promise(resolve => setImmediate(resolve))
function fixture(send, supported = () => true) {
  let latest = { jobId: 'one', status: 'running' }, listener
  const announced = new Set(), released = [], calls = []
  const notifier = createCompletionNotifier({
    delegation: { workbench: () => latest, subscribe(fn) { listener = fn; return () => { listener = null } } },
    feedback: { completion(id) { if (announced.has(id)) return null; announced.add(id); return { speech: { text: id } } }, releaseCompletion(id) { announced.delete(id); released.push(id) } },
    supported,
    send: (text, options) => { calls.push(text); return send(text, options) },
  })
  return { notifier, calls, released, async change(jobId, status) { latest = { jobId, status }; listener?.(); await tick() } }
}

test('completion is requested once; repeated state and refresh do not repeat it', async () => {
  const f = fixture(async () => ({ acknowledged: true }))
  await f.change('one', 'completed'); f.notifier.refresh(); await tick()
  assert.deepEqual(f.calls, ['one'])
  assert.equal(f.notifier.state().status, 'client_acknowledged')
  assert.equal(f.notifier.state().delivery, 'unverified')
  await f.notifier.close()
})

test('a new intent cancels an obsolete pending completion', async () => {
  let aborted = false
  const f = fixture((_, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(new Error('cancelled')) }, { once: true })))
  await f.change('one', 'completed'); await f.change('two', 'running')
  assert.equal(aborted, true)
  assert.notEqual(f.notifier.state().status, 'client_acknowledged')
  await f.notifier.close()
})

test('known rejection releases voice-watch fallback but does not sample the same job again', async () => {
  const f = fixture(async () => { throw Object.assign(new Error('rejected'), { code: 'SAMPLING_REJECTED' }) })
  await f.change('one', 'completed'); f.notifier.refresh(); await tick()
  assert.deepEqual(f.released, ['one']); assert.deepEqual(f.calls, ['one'])
  assert.equal(f.notifier.state().status, 'failed')
  await f.notifier.close()
})

test('unknown outcome stays reserved and is never replayed after reconnect', async () => {
  const f = fixture(async () => { throw Object.assign(new Error('unknown'), { code: 'SAMPLING_OUTCOME_UNKNOWN' }) })
  await f.change('one', 'completed'); f.notifier.refresh(); await tick()
  assert.deepEqual(f.released, []); assert.deepEqual(f.calls, ['one'])
  assert.equal(f.notifier.state().status, 'outcome_unknown')
  await f.notifier.close()
})

test('a completion while disconnected can be delivered on readiness refresh', async () => {
  let ready = false
  const f = fixture(async () => ({}), () => ready)
  await f.change('one', 'completed'); assert.deepEqual(f.calls, [])
  ready = true; f.notifier.refresh(); await tick()
  assert.deepEqual(f.calls, ['one'])
  await f.notifier.close()
})
