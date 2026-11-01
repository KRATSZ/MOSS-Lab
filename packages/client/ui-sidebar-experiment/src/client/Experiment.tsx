import { useState, type ReactNode } from 'react'
import { Button, IconPlayOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from './locales.ts'
import css from './Experiment.module.css'

/** Check the current experiment on each mount and explicit refresh. */
export function ExperimentBody({ t, useResource, useTabInfo, sessionId }: PropsLocale<'sidebarExperiment'> & PropsRuntime<'sidebar.right.pane.tab'>): ReactNode {
  const [generation, setGeneration] = useState(0)
  const [robotGeneration, setRobotGeneration] = useState(0)
  const [demoTask, setDemoTask] = useState<string | null | undefined>(undefined)
  const { tab } = useTabInfo()
  const robot = useResource<'robotstatus'>(`dsh-resource://robotstatus/${robotGeneration}`)
  const robotValue = robotGeneration > 0 && robot.status === 'live' ? robot.value : undefined
  const watched = useResource<'experimentwatch'>(`dsh-resource://experimentwatch/${encodeURIComponent(sessionId)}`)
  const task = watched.status === 'live' && watched.value !== undefined ? (watched.value.status === 'ready' ? watched.value.task : null) : undefined
  const demo = demoTask !== undefined && (task == null || task === demoTask)
  const address = `dsh-resource://experimentstatus/${encodeURIComponent(sessionId)}/${encodeURIComponent(tab.id)}/${generation}`
  const resource = useResource<'experimentstatus'>(demo ? `${address}?mode=demo` : address)
  const ready = resource.status === 'live' && resource.value?.status === 'ready' ? resource.value : undefined
  const failed = resource.status === 'failed' || resource.status === 'none'
  const message = failed ? t('error')
    : resource.status === 'loading' || resource.value?.status === 'checking' ? t('checking') : demo ? t('demoWaiting') : t('waiting')
  return (
    <div className={css.preview}>
      {demo && <div className={css.demoInfo}>
        <strong>{t('demoLabel')}</strong>
        <div>{t('demoControls')}</div>
        <div>{t('demoUnavailable')}</div>
      </div>}
      <div className={css.toolbar}>
        <Button size="sm" variant="outline" onClick={() => setDemoTask(demo ? undefined : task ?? null)}>{t(demo ? 'returnToExperiment' : 'viewDemo')}</Button>
        <Button size="sm" variant="outline" onClick={() => setGeneration(value => value + 1)}>{t('refresh')}</Button>
        <Button size="sm" variant="outline" onClick={() => setRobotGeneration(value => value + 1)}>{t('robotQuery')}</Button>
      </div>
      {robotGeneration > 0 && <div className={css.robotInfo} role="status">
        {robot.status === 'failed' || robot.status === 'none' ? t('robotUnavailable')
          : robotValue === undefined ? t('robotChecking')
            : <>
              <div>{t(robotValue.status === 'not_configured' ? 'robotNotConfigured' : robotValue.status === 'unreachable' ? 'robotUnavailable' : robotValue.status === 'partial' ? 'robotPartial' : 'robotConnected')}</div>
              {robotValue.health && <>
                <div>{t('robotModel')}: {robotValue.health.robotModel ?? t('robotUnknown')}</div>
                <div>{t('robotHealth')}: {robotValue.health.status ?? t('robotUnknown')}</div>
              </>}
              {robotValue.instruments !== null && <div>{t('robotInstruments')}: {robotValue.instruments.length === 0 ? t('robotNone') : robotValue.instruments.map(item => `${t(item.mount === 'left' ? 'robotLeft' : 'robotRight')}: ${item.name ?? t('robotUnknown')}`).join(' · ')}</div>}
              <div>{t('robotTime')}: {new Date(robotValue.queriedAt).toLocaleString()}</div>
            </>}
      </div>}
      {ready
        ? <iframe className={css.frame} title={t('title')} sandbox="allow-scripts" srcDoc={ready.document} />
        : <div className={css.waiting}><div role={failed ? 'alert' : 'status'}>{message}</div></div>}
    </div>
  )
}

/** Animation tab icon and title. */
export function ExperimentTitle({ useTabInfo }: PropsRuntime<'sidebar.right.pane.tab.title'>): ReactNode {
  const { tab } = useTabInfo()
  return <><IconPlayOutlineRegular className={css.icon} />{tab.title}</>
}
