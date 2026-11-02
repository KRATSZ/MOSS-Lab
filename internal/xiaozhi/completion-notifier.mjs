/** Issue one current-task completion request; acknowledgement is not proof of audible playback. */
export function createCompletionNotifier({ delegation, feedback, supported, send, record = () => {} }) {
  let state = { status: 'idle', jobId: null, delivery: 'unverified' }
  const pending = new Set()
  const rejected = new Set()
  let current = null, closed = false
  const update = (status, jobId, detail = null) => {
    state = { status, jobId, delivery: 'unverified', detail }
    try { record({ kind: 'completion_notification', ...state, at: Date.now() }) } catch { console.warn('completion notification diagnostics failed') }
  }
  const observe = () => {
    if (closed) return
    const latest = delegation.workbench()
    if (current && current.jobId !== latest.jobId) { current.controller.abort(); current = null }
    if (!latest.jobId || rejected.has(latest.jobId) || !['completed', 'error'].includes(latest.status) || !supported()) return
    const notice = feedback.completion(latest.jobId)
    if (!notice) return
    const controller = new AbortController()
    const owner = { jobId: latest.jobId, controller }
    current = owner
    update('requested', latest.jobId)
    const operation = Promise.resolve().then(async () => {
      try {
        await send(notice.speech.text, { signal: controller.signal })
        if (!controller.signal.aborted && delegation.workbench().jobId === owner.jobId) update('client_acknowledged', owner.jobId)
      } catch (error) {
        if (controller.signal.aborted) return
        if (['SAMPLING_REJECTED', 'SAMPLING_INVALID_RESPONSE', 'SAMPLING_UNSUPPORTED'].includes(error?.code)) rejected.add(owner.jobId)
        if (['SAMPLING_UNSUPPORTED', 'SAMPLING_REJECTED', 'SAMPLING_UNAVAILABLE', 'SAMPLING_BUSY', 'SAMPLING_INVALID_RESPONSE'].includes(error?.code)) feedback.releaseCompletion(owner.jobId)
        if (delegation.workbench().jobId === owner.jobId) update(error?.code === 'SAMPLING_OUTCOME_UNKNOWN' ? 'outcome_unknown' : 'failed', owner.jobId, error?.code ?? 'SAMPLING_FAILED')
      } finally { if (current === owner) current = null }
    })
    pending.add(operation)
    void operation.then(() => pending.delete(operation))
  }
  const stop = delegation.subscribe(observe)
  return {
    state: () => ({ ...state }),
    refresh: observe,
    async close() { closed = true; stop(); current?.controller.abort(); await Promise.allSettled(pending) },
  }
}
