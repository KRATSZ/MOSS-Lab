import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { Context } from '../../../vendor/cordis/src/index.ts'
import { LocalSandboxProvider } from '../../../packages/sandbox/sandbox-local/src/index.ts'
import { ensurePluginRuntime } from '../../../scripts/labscriptai-runtime.mjs'
import { createPluginClient } from '../plugin-client.mjs'

const require = createRequire(resolve('apps/web/package.json'))
const { chromium } = require('playwright')
const executablePath = process.env.MOSS_CHROMIUM

test('renders the public plugin document in an opaque sandbox', { timeout: 90000, skip: !executablePath }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'plugin-browser-'))
  const ctx = new Context()
  let browser
  try {
    await ctx.plugin(LocalSandboxProvider, {}).await()
    const runtime = await ensurePluginRuntime(resolve(import.meta.dirname, '../../..'), { installer: async () => {} })
    const client = createPluginClient({ ...runtime, data: directory, sandbox: ctx.sandbox, timeoutMs: 300000 })
    const analysis = Buffer.from(JSON.stringify({ robotType: 'OT-3 Standard', metadata: { protocolName: 'test analysis' }, commands: [{ id: 'home', commandType: 'home', params: {}, status: 'succeeded' }] }))
    const documents = await client.documents(analysis)
    assert.ok(documents.animation)
    assert.ok(documents.setup)
    browser = await chromium.launch({ executablePath })
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.setContent('<iframe sandbox="allow-scripts" style="width:800px;height:650px"></iframe>')
    await page.locator('iframe').evaluate((element, value) => { element.srcdoc = value }, documents.animation.toString())
    const frame = page.frameLocator('iframe')
    await frame.locator('canvas').waitFor({ timeout: 30000 })
    assert.ok(await frame.locator('#steps li').count() > 0)
    await frame.locator('#play').click()
    assert.ok(await frame.locator('#play').textContent())
    assert.deepEqual(errors, [])
    if (process.env.MOSS_PREVIEW_SCREENSHOT) await page.screenshot({ path: process.env.MOSS_PREVIEW_SCREENSHOT })
  } finally {
    if (browser) await browser.close()
    await ctx.fiber.dispose()
    await rm(directory, { recursive: true, force: true })
  }
})
