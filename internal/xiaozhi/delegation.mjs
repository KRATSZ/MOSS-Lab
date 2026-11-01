import { randomUUID } from 'node:crypto'

/** Own one web-visible session per delegated request. */
export function createDelegation({ controller, workspaces, events, timeoutMs = 300000 }) {
  const jobs = new Map()
  let closed = false

  async function submit(message) {
    if (closed) throw new Error('委派服务已关闭')
    if (typeof message !== 'string' || !message.trim() || Buffer.byteLength(message) > 8000) throw new Error('委派内容须为不超过 8000 字节的非空文字')
    if ([...jobs.values()].some(job => job.status === 'running' || job.status === 'timeout')) throw new Error('已有小智任务正在执行，请稍后查询结果')
    if (jobs.size >= 100) jobs.delete(jobs.keys().next().value)
    const jobId = randomUUID()
    const job = { jobId, status: 'running', sessionId: null, result: null }
    jobs.set(jobId, job)
    let stopClaim, stopEvent, stopDiscard, timer
    let promptStarted = false
    let observing = true
    let observationClosed = false
    const cleanup = () => {
      observing = false
      clearTimeout(timer)
      stopClaim?.(); stopEvent?.(); stopDiscard?.()
    }
    const finish = (status, result) => {
      if (!observing) return
      job.status = status
      job.result = result
      cleanup()
    }
    job.cancelObservation = () => {
      if (!observing) return
      observationClosed = true
      job.status = 'error'
      job.result = '委派服务已关闭，无法继续跟踪；任务可能仍在网页中运行'
      cleanup()
    }
    const checkOpen = () => { if (closed) throw new Error('委派服务已关闭') }
    try {
      const workspace = workspaces.list()[0]
      if (!workspace) throw new Error('网页中尚无工作区，请先创建工作区')
      const created = await controller.create({ workspaceId: workspace.id, agentPreset: 'standard' })
      job.sessionId = created.sessionId
      checkOpen()
      await controller.rename({ sessionId: job.sessionId, title: `小智委派实验 ${new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}` })
      checkOpen()
      const requestId = randomUUID()
      let turn
      let finalText = ''
      stopClaim = events.on('agent/inbox/claimed', ({ agent, message: claimed, turn: claimedTurn }) => {
        if (agent.id === job.sessionId && claimed.source?.rpcId === requestId) turn = claimedTurn
      }, { global: true })
      stopDiscard = events.on('agent/inbox/discarded', ({ agent, message: discarded }) => {
        if (agent.id === job.sessionId && discarded.source?.rpcId === requestId) finish('error', '任务在执行前被取消')
      }, { global: true })
      stopEvent = events.on('session/event', (session, event) => {
        if (session.id !== job.sessionId || turn === undefined || event.data?.turn !== turn) return
        if (event.type === 'assistant/message' && !event.data.interrupted) {
          const content = event.data.message?.content
          if (Array.isArray(content)) finalText = content.filter(part => part.type === 'text').map(part => part.text).join('\n').slice(0, 4000)
        }
        if (event.type === 'turn/end') {
          if (event.data.reason?.kind === 'completed' && finalText.trim()) finish('completed', finalText)
          else finish('error', `任务未正常完成：${event.data.reason?.kind ?? '未知原因'}；请查看网页会话`)
        }
      }, { global: true })
      timer = setTimeout(() => {
        if (!observing) return
        job.status = 'timeout'
        job.result = job.result ? `${job.result}；等待结果已超时，仍在跟踪` : '等待结果超时，任务仍被跟踪，请稍后查询或查看网页会话'
      }, timeoutMs)
      promptStarted = true
      await controller.prompt({ sessionId: job.sessionId, requestId, mode: 'queue', content: [{ type: 'text', text: `来自小智的委派：\n${message}` }] }, new AbortController().signal)
      return { jobId, sessionId: job.sessionId, status: job.status, note: observationClosed ? '委派服务已关闭，无法继续跟踪；任务可能仍在网页中运行。' : '任务已发送到本地网页工作区，请查询结果。' }
    } catch (error) {
      if (promptStarted) {
        if (observing && (job.status === 'running' || job.status === 'timeout')) {
          job.result = `提交结果未知：${error.message}；任务可能仍在网页中运行，请查看会话`
        }
        const note = observationClosed ? '委派服务已关闭，无法继续跟踪；任务可能仍在网页中运行。'
          : observing ? '提交结果未知，请查询任务状态并查看网页会话。'
            : '任务已有结果，请查询任务状态。'
        return { jobId, sessionId: job.sessionId, status: job.status, note }
      }
      finish('error', `委派失败：${error.message}`)
      throw error
    }
  }

  return {
    submit,
    get(jobId) {
      const job = jobs.get(jobId)
      if (!job) throw new Error('任务不存在或服务已重启')
      return { jobId: job.jobId, sessionId: job.sessionId, status: job.status, result: job.result }
    },
    close() {
      closed = true
      for (const job of jobs.values()) if (job.status === 'running' || job.status === 'timeout') job.cancelObservation?.()
    },
  }
}
