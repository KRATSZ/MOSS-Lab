// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { VoiceWorkbench, createVoiceNavigationStore } from '../src/client/voice-workbench.tsx'
import { AutoOpenExperiment, createAutoOpenStore } from '../src/client/auto-open.tsx'
import { ExperimentBody } from '../src/client/Experiment.tsx'
import { voiceWorkbenchProvider } from '../src/client/status.ts'
import { zh } from '../src/client/locales.ts'

describe('voice experiment workbench', () => {
  it('navigates once per accepted message, not when a reply completes or the user leaves', async () => {
    const store = createVoiceNavigationStore().create()
    const navigate = vi.fn(async () => {})
    let sequence = 1
    let status = 'running'
    const props = { useResource: () => ({ status: 'live', value: { sequence, status, sessionId: 'voice-session' } }),
      useStore: (select: (state: ReturnType<typeof store.getSnapshot>) => unknown) => select(store.getSnapshot()),
      actions: store.actions, navigate, t: (key: string) => key } as Parameters<typeof VoiceWorkbench>[0]
    const view = render(<VoiceWorkbench {...props} />)
    await waitFor(() =>{  expect(navigate).toHaveBeenCalledTimes(1) })
    expect(navigate).toHaveBeenCalledWith('voice-session', expect.any(AbortSignal))
    status = 'completed'
    view.rerender(<VoiceWorkbench {...props} />)
    expect(navigate).toHaveBeenCalledTimes(1)
    sequence++
    view.rerender(<VoiceWorkbench {...props} />)
    await waitFor(() =>{  expect(navigate).toHaveBeenCalledTimes(2) })
    view.unmount()
  })

  it('opens the voice task before the first preview is generated', () => {
    const store = createAutoOpenStore().create()
    const openExperiment = vi.fn(() => true)
    const props = { sessionId: 'voice-session', useResource: (address: string) => ({ status: 'live', value: address.includes('voiceworkbench')
      ? { sequence: 1, status: 'running', sessionId: 'voice-session' } : { status: 'waiting' } }),
    useSidebarMounted: () => true, openExperiment,
    useStore: (select: (state: ReturnType<typeof store.getSnapshot>) => unknown) => select(store.getSnapshot()),
    actions: store.actions } as Parameters<typeof AutoOpenExperiment>[0]
    const view = render(<AutoOpenExperiment {...props} />)
    expect(openExperiment).toHaveBeenCalledTimes(1)
    view.unmount()
  })

  it('hides the old animation during a voice revision and displays the checked replacement', () => {
    let updating = true
    const props = { sessionId: 'voice-session', useTabInfo: () => ({ tab: { id: 'tab' } }),
      t: (key: keyof typeof zh) => zh[key],
      useResource: (address: string) => ({ status: 'live', value: address.includes('voiceworkbench')
        ? { sequence: 2, sessionId: 'voice-session', status: updating ? 'running' : 'completed' }
        : { status: 'ready', id: 'experiment', revision: updating ? 1 : 2, task: updating ? 'old' : 'new', document: updating ? '<p>old</p>' : '<p>four repeats</p>' } }) } as Parameters<typeof ExperimentBody>[0]
    const view = render(<ExperimentBody {...props} />)
    expect(view.container.querySelector('iframe')).toBeNull()
    expect(screen.getByRole('status').textContent).toBe(zh.voiceWorking)
    updating = false
    view.rerender(<ExperimentBody {...props} />)
    expect(view.container.querySelector('iframe')?.getAttribute('srcdoc')).toContain('four repeats')
    expect(view.container.querySelector('[data-experiment-revision]')?.getAttribute('data-experiment-revision')).toBe('2')
    view.unmount()
  })

  it('uses the authenticated endpoint and rejects malformed task identities', async () => {
    const request = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ sequence:1,sessionId:'s',jobId:'j',status:'running',result:null }))
    const controller = new AbortController()
    const iterator = voiceWorkbenchProvider.open('dsh-resource://voiceworkbench/current', { signal:controller.signal })[Symbol.asyncIterator]()
    try {
      expect((await iterator.next()).value).toMatchObject({ ok:true,value:{ sessionId:'s' } })
      expect(request).toHaveBeenCalledWith('/api/xiaozhi-workbench',expect.objectContaining({ credentials:'same-origin',cache:'no-store' }))
    } finally {controller.abort();await iterator.return?.();request.mockRestore()}
  })
})


describe('completion and preview polling order', () => {
  it('uses a fresh preview resource when the voice reply completes before the old preview poll', () => {
    let status='running'
    const addresses:string[]=[]
    const props={ sessionId:'s',useTabInfo:()=>({ tab:{ id:'tab' } }),t:(key:keyof typeof zh)=>zh[key],useResource:(address:string)=>{
      addresses.push(address)
      if (address.includes('voiceworkbench')) return { status:'live',value:{ sequence:2,sessionId:'s',status } }
      if (address.endsWith('/2/completed')) return { status:'loading' }
      return { status:'live',value:{ status:'ready',id:'e',revision:1,task:'old',document:'old preview' } }
    } } as Parameters<typeof ExperimentBody>[0]
    const view=render(<ExperimentBody {...props}/>)
    status='completed'
    view.rerender(<ExperimentBody {...props}/>)
    expect(addresses.some(address=>address.endsWith('/2/completed'))).toBe(true)
    expect(view.container.querySelector('iframe')).toBeNull()
    view.unmount()
  })
})

describe('voice polling interruption', () => {
  it('keeps the revision receipt and hides the preview until polling recovers', () => {
    let status = 'live'
    let taskStatus = 'running'
    const addresses: string[] = []
    const props = { sessionId: 's', useTabInfo: () => ({ tab: { id: 'tab' } }), t: (key: keyof typeof zh) => zh[key],
      useResource: (address: string) => {
        addresses.push(address)
        return address.includes('voiceworkbench') ? { status, value: { sequence: 2, sessionId: 's', status: taskStatus } }
          : { status: 'live', value: { status: 'ready', revision: 1, document: 'old preview' } }
      } } as Parameters<typeof ExperimentBody>[0]
    const view = render(<ExperimentBody {...props} />)
    status = 'failed'
    view.rerender(<ExperimentBody {...props} />)
    expect(addresses.at(-1)).toMatch(/\/2\/running$/)
    expect(view.container.querySelector('iframe')).toBeNull()
    expect(screen.getByRole('alert').textContent).toBe(zh.error)
    taskStatus = 'completed'
    view.rerender(<ExperimentBody {...props} />)
    expect(view.container.querySelector('iframe')).toBeNull()
    status = 'live'
    view.rerender(<ExperimentBody {...props} />)
    expect(addresses.at(-1)).toMatch(/\/2\/completed$/)
    expect(view.container.querySelector('iframe')).not.toBeNull()
    view.unmount()
  })

  it('does not reopen a stale preview when voice polling fails', () => {
    const store = createAutoOpenStore().create()
    const openExperiment = vi.fn(() => true)
    let status = 'live'
    const props = { sessionId: 's', useResource: (address: string) => address.includes('voiceworkbench')
      ? { status, value: { sequence: 2, sessionId: 's', status: 'running' } }
      : { status: 'live', value: { status: 'ready', id: 'e', revision: 1 } },
    useSidebarMounted: () => true, openExperiment,
    useStore: (select: (state: ReturnType<typeof store.getSnapshot>) => unknown) => select(store.getSnapshot()),
    actions: store.actions } as Parameters<typeof AutoOpenExperiment>[0]
    const view = render(<AutoOpenExperiment {...props} />)
    expect(openExperiment).toHaveBeenCalledTimes(1)
    status = 'failed'
    view.rerender(<AutoOpenExperiment {...props} />)
    status = 'live'
    view.rerender(<AutoOpenExperiment {...props} />)
    expect(openExperiment).toHaveBeenCalledTimes(1)
    view.unmount()
  })
})

it('retries a cold catalog and cancels retry work when the overlay leaves', async () => {
  const store = createVoiceNavigationStore().create()
  const navigate = vi.fn().mockRejectedValueOnce(new Error('catalog pending')).mockResolvedValue(undefined)
  const props = { useResource: () => ({ status: 'live', value: { sequence: 1, status: 'running', sessionId: 's' } }),
    useStore: (select: (state: ReturnType<typeof store.getSnapshot>) => unknown) => select(store.getSnapshot()),
    actions: store.actions, navigate, t: (key: string) => key } as Parameters<typeof VoiceWorkbench>[0]
  const view = render(<VoiceWorkbench {...props} />)
  await waitFor(() => { expect(navigate).toHaveBeenCalledTimes(2) })
  expect(store.getSnapshot().sequence).toBe(1)
  expect(screen.queryByRole('alert')).toBeNull()
  view.unmount()
  const pending = vi.fn().mockRejectedValue(new Error('catalog pending'))
  const cancelled = render(<VoiceWorkbench {...props} useStore={select => select({ sequence: -1 })} navigate={pending} />)
  await waitFor(() => { expect(pending).toHaveBeenCalledTimes(1) })
  cancelled.unmount()
  await new Promise(resolve => setTimeout(resolve, 300))
  expect(pending).toHaveBeenCalledTimes(1)
})

it('leaves selection alone for amendments and follows only a focus event', async () => {
  const store = createVoiceNavigationStore().create()
  const navigate = vi.fn(async () => {})
  let sequence = 1, focusSequence = 10
  const props = { useResource: () => ({ status: 'live', value: { sequence, focusSequence, status: 'running', sessionId: 's' } }),
    useStore: (select: (state: ReturnType<typeof store.getSnapshot>) => unknown) => select(store.getSnapshot()),
    actions: store.actions, navigate, t: (key: string) => key } as Parameters<typeof VoiceWorkbench>[0]
  const view = render(<VoiceWorkbench {...props} />)
  await waitFor(() => { expect(navigate).toHaveBeenCalledTimes(1) })
  sequence++
  view.rerender(<VoiceWorkbench {...props} />)
  expect(navigate).toHaveBeenCalledTimes(1)
  focusSequence++
  view.rerender(<VoiceWorkbench {...props} />)
  await waitFor(() => { expect(navigate).toHaveBeenCalledTimes(2) })
  view.unmount()
})

it('shows a checked current preview as soon as its phase is ready and rejects stale versions', () => {
  let revision = 2
  const props = { sessionId: 's', useTabInfo: () => ({ tab: { id: 'tab' } }), t: (key: keyof typeof zh) => zh[key],
    useResource: (address: string) => ({ status: 'live', value: address.includes('voiceworkbench')
      ? { sequence: 4, sessionId: 's', status: 'running', phase: 'preview_ready', preview: { id: 'e', revision: 3 } }
      : { status: 'ready', id: 'e', revision, document: 'current three-dimensional preview' } }) } as Parameters<typeof ExperimentBody>[0]
  const view = render(<ExperimentBody {...props} />)
  expect(view.container.querySelector('iframe')).toBeNull()
  revision = 3
  view.rerender(<ExperimentBody {...props} />)
  expect(view.container.querySelector('iframe')?.getAttribute('srcdoc')).toContain('current three-dimensional preview')
  expect(view.container.querySelector('[data-experiment-revision]')?.getAttribute('data-experiment-revision')).toBe('3')
  view.unmount()
})

it('shows the missing condition instead of claiming to keep generating', () => {
  const props = { sessionId: 's', useTabInfo: () => ({ tab: { id: 'tab' } }), t: (key: keyof typeof zh) => zh[key],
    useResource: (address: string) => ({ status: 'live', value: address.includes('voiceworkbench')
      ? { sequence: 2, sessionId: 's', status: 'completed', phase: 'needs_input', question: '每孔最终体积是多少？' }
      : { status: 'waiting' } }) } as Parameters<typeof ExperimentBody>[0]
  const view = render(<ExperimentBody {...props} />)
  expect(screen.getByText('每孔最终体积是多少？')).toBeTruthy()
  expect(screen.getByText(zh.voiceNeedsInput)).toBeTruthy()
  expect(screen.queryByText(zh.voiceWorking)).toBeNull()
  view.unmount()
})
