/** Voice-task navigation through the shipped Web composition and a recorded conversation. */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser } from 'playwright'
import { expect, it } from 'vitest'
import { compareOrRefreshGolden, launchWebScaffold, seedSession, webSnapshotMode } from './scaffold.ts'

it('reveals the delegated session and its preparing workbench without opening a new chat', async () => {
  const scaffold = await launchWebScaffold()
  let browser: Browser | undefined
  try {
    browser = await chromium.launch()
    const recorded = await readFile(fileURLToPath(new URL('../../../snapshots/web/fresh-round-trip/session.v4.jsonl', import.meta.url)), 'utf8')
    const sessionId = await seedSession(scaffold, recorded, 'voice-workbench-session')
    await scaffold.ctx.sessionController.rename({ sessionId, title: 'Voice experiment' })
    let sequence = 0
    const page = await browser.newPage({ locale: 'en-US', viewport: { width: 1440, height: 900 } })
    await page.route('**/api/xiaozhi-workbench', route => route.fulfill({ json: {
      sequence, sessionId: sequence ? 'voice-workbench-session' : null,
      jobId: sequence ? 'voice-job' : null, status: sequence ? 'running' : 'idle', result: null,
    } }))
    await page.route('**/api/experiment-preview?*', route => route.fulfill({ json: { status: 'waiting' } }))
    page.on('pageerror', (error) => { console.error('voice-page:', error.message) })
    page.on('console', (entry) => { if (entry.type() === 'error') console.error('voice-console:', entry.text()) })
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    sequence = 1
    const preparing = page.getByRole('status').filter({ hasText: 'Preparing the updated plan.' })
    try {
      await expect.poll(() => preparing.count(), { timeout: 15000 }).toBe(1)
    } catch (error) {
      console.error('voice-workbench UI:', await page.locator('body').ariaSnapshot())
      throw error
    }
    await expect.poll(() => page.getByRole('tab', { name: 'Experiment animation' }).count()).toBe(1)
    await compareOrRefreshGolden(fileURLToPath(new URL('./expected/voice-workbench/preparing.expected.md', import.meta.url)),
      await preparing.ariaSnapshot(), webSnapshotMode())
  } finally {
    await browser?.close()
    await scaffold.close()
  }
})
