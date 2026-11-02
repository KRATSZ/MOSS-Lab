import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDelegation } from './delegation.mjs'
import { createVoiceFeedback } from './voice-feedback.mjs'

function fixture() {
  const handlers = new Map(), requests = [], removed = []
  let created = 0
  const events = { on(name, fn) {
    if (!handlers.has(name)) handlers.set(name, new Set())
    handlers.get(name).add(fn)
    return () => handlers.get(name).delete(fn)
  } }
  const emit = (name, ...args) => { for (const fn of [...handlers.get(name) ?? []]) fn(...args) }
  const delegation = createDelegation({ events, workspaces: { list: () => [{ id: 'w' }] },
    controller: { create: async () => ({ sessionId: 's' + ++created }), rename: async () => {}, prompt: async input => { requests.push(input) } },
    removePendingVoice: async (id, requestId) => removed.push({ id, requestId }) })
  return { delegation, requests, removed, get created() { return created },
    claim(index, turn = 1) { const request = requests[index]; emit('agent/inbox/claimed', { agent: { id: request.sessionId }, message: { source: { rpcId: request.requestId } }, turn }) },
    end(index, text = 'done', turn = 1) {
      const request = requests[index]
      emit('session/event', { id: request.sessionId }, { type: 'assistant/message', data: { turn, message: { content: [{ type: 'text', text }] } } })
      emit('session/event', { id: request.sessionId }, { type: 'turn/end', data: { turn, reason: { kind: 'completed' } } })
    },
  }
}

test('amendments immediately supersede older jobs and cannot publish an older intent', async () => {
  const f = fixture()
  try {
    const first = await f.delegation.submit('3 repeats'); f.claim(0)
    const originalGuard = f.delegation.captureIntent(first.sessionId)
    const firstFocus = f.delegation.workbench().focusSequence
    const amended = await f.delegation.submit('actually 4 repeats')
    assert.equal(amended.sessionId, first.sessionId)
    assert.equal(f.requests[1].mode, 'steer')
    assert.equal(f.delegation.get(first.jobId).status, 'superseded')
    assert.equal(f.delegation.get(first.jobId).supersededBy, amended.jobId)
    assert.equal(f.delegation.get(first.jobId).cycleId, f.delegation.get(amended.jobId).cycleId)
    assert.equal(f.delegation.workbench().focusSequence, firstFocus)
    assert.deepEqual(f.removed, [{ id: first.sessionId, requestId: f.requests[0].requestId }])
    assert.throws(originalGuard, error => error.code === 'VOICE_SUPERSEDED')
    assert.throws(() => f.delegation.captureIntent(first.sessionId), error => error.code === 'VOICE_INTENT_PENDING')
    assert.equal(f.delegation.previewReady({ sessionId: first.sessionId, id: 'e', revision: 1 }), false)
    f.end(0, 'old result')
    assert.equal(f.delegation.get(amended.jobId).status, 'running')
    f.claim(1, 2)
    f.delegation.captureIntent(first.sessionId)()
    assert.equal(f.delegation.previewReady({ sessionId: first.sessionId, id: 'e', revision: 2 }), true)
    const readyFocus = f.delegation.workbench().focusSequence
    assert.ok(readyFocus > firstFocus)
    f.delegation.previewReady({ sessionId: first.sessionId, id: 'e', revision: 2 })
    assert.equal(f.delegation.workbench().focusSequence, readyFocus)
    f.end(1, 'new result', 2)
    assert.equal(f.delegation.get(amended.jobId).phase, 'preview_ready')
    assert.equal(f.delegation.get(amended.jobId).result, 'new result')
  } finally { f.delegation.close() }
})

test('concurrent voice admissions share one conversation and retain only the latest pending amendment', async () => {
  const f = fixture()
  try {
    const receipts = await Promise.all(['3 repeats', '4 repeats', '5 repeats'].map(text => f.delegation.submit(text)))
    assert.equal(f.created, 1)
    assert.deepEqual(f.requests.map(request => request.mode), ['queue', 'steer', 'steer'])
    assert.deepEqual(receipts.map(receipt => f.delegation.get(receipt.jobId).status), ['superseded', 'superseded', 'running'])
    assert.equal(f.removed.length, 2)
    f.claim(2)
    f.end(2, 'five repeats')
    assert.equal(f.delegation.get(receipts[2].jobId).result, 'five repeats')
  } finally { f.delegation.close() }
})

test('three wait hints cover the whole amendment cycle; automatic completion is issued once', async () => {
  const f = fixture()
  let now = 0
  const feedback = createVoiceFeedback({ delegation: f.delegation, offsetsMs: [0, 15, 45], pollWaitMs: 1, now: () => now })
  try {
    const first = await f.delegation.submit('3 repeats'); f.claim(0)
    assert.equal(feedback.receipt(first.jobId).speech.waitingCount, 1)
    now = 14
    assert.equal((await feedback.status(first.jobId)).speech.speak, false)
    now = 15
    assert.equal((await feedback.status(first.jobId)).speech.waitingCount, 2)
    const latest = await f.delegation.submit('4 repeats'); f.claim(1)
    assert.equal(feedback.receipt(latest.jobId).speech.speak, false)
    now = 45
    assert.equal((await feedback.status(latest.jobId)).speech.waitingCount, 3)
    now = 10000
    for (let i = 0; i < 65; i++) assert.equal((await feedback.status(latest.jobId)).speech.speak, false)
    const old = await feedback.status(first.jobId)
    assert.equal(old.followJobId, latest.jobId)
    assert.equal(old.speech.speak, false)
    assert.equal(feedback.snapshot().waitingCount, 3)
    f.delegation.previewReady({ sessionId: latest.sessionId, id: 'e', revision: 4 })
    f.end(1, 'a very long assistant explanation')
    const completed = await feedback.status(latest.jobId)
    assert.equal(completed.speech.text, '预览已更新，请看电脑。')
    assert.equal(completed.result, completed.speech.text)
    assert.equal(completed.speech.speak, true)
    assert.equal((await feedback.status(latest.jobId)).speech.speak, false)
    const next = await f.delegation.submit('another task')
    assert.equal(feedback.receipt(next.jobId).speech.waitingCount, 1)
    await feedback.status(latest.jobId)
    assert.equal(feedback.snapshot().waitingCount, 1)
  } finally { feedback.close(); f.delegation.close() }
})

test('explicit progress questions are answered without resetting the automatic speech budget', async () => {
  const f = fixture()
  const feedback = createVoiceFeedback({ delegation: f.delegation, offsetsMs: [0, 15, 45], pollWaitMs: 1, now: () => 0 })
  try {
    const accepted = await f.delegation.submit('work')
    feedback.receipt(accepted.jobId)
    const answer = await feedback.status(accepted.jobId, { userQuery: true })
    assert.equal(answer.speech.speak, true)
    assert.equal(answer.speech.waitingCount, 1)
    assert.equal(answer.speech.reason, 'user_query')
  } finally { feedback.close(); f.delegation.close() }
})

test('cancelling a status watch removes its subscription without cancelling the actual task', async () => {
  const f = fixture()
  let subscriptions = 0
  const watchable = { ...f.delegation, subscribe(listener) { subscriptions++; const stop = f.delegation.subscribe(listener); return () => { subscriptions--; stop() } } }
  const feedback = createVoiceFeedback({ delegation: watchable, offsetsMs: [0, 15, 45], pollWaitMs: 10000 })
  try {
    const job = await f.delegation.submit('work')
    feedback.receipt(job.jobId)
    const controller = new AbortController()
    const pending = feedback.status(job.jobId, { signal: controller.signal })
    assert.equal(subscriptions, 1)
    controller.abort()
    await assert.rejects(pending, /取消/)
    assert.equal(subscriptions, 0)
    assert.equal(f.delegation.get(job.jobId).status, 'running')
  } finally { feedback.close(); f.delegation.close() }
})

test('a clarification focuses once and finishes as needs_input rather than a preview completion', async () => {
  const f = fixture()
  const feedback = createVoiceFeedback({ delegation: f.delegation, offsetsMs: [0, 15, 45], pollWaitMs: 1 })
  try {
    const accepted = await f.delegation.submit('missing conditions'); f.claim(0)
    const initialFocus = f.delegation.workbench().focusSequence
    assert.equal(f.delegation.needsInput(accepted.sessionId, '每孔最终体积是多少？'), true)
    const confirmationFocus = f.delegation.workbench().focusSequence
    assert.ok(confirmationFocus > initialFocus)
    f.delegation.needsInput(accepted.sessionId, '每孔最终体积是多少？')
    assert.equal(f.delegation.workbench().focusSequence, confirmationFocus)
    f.end(0, '每孔最终体积是多少？')
    assert.equal((await feedback.status(accepted.jobId)).speech.text, '每孔最终体积是多少？')
  } finally { feedback.close(); f.delegation.close() }
})
