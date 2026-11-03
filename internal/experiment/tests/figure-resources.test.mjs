import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PreviewResources } from '../preview-resources.mjs'

test('setup downloads retain session, revision and task checks, and reject arbitrary paths', async t => {
  const root = await mkdtemp(join(tmpdir(), 'setup-resource-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const folder = 'a'.repeat(20) + '-' + 'b'.repeat(12)
  const files = ['setup.png', 'setup.html', 'setup.json', 'wells.csv']
  await mkdir(join(root, 'figures', folder), { recursive: true })
  await writeFile(join(root, 'info.json'), JSON.stringify({ setup_figure: { ok: true, folder, files } }))
  await writeFile(join(root, 'view.json'), '{}')
  await writeFile(join(root, 'figures', folder, 'setup.png'), 'png')
  await writeFile(join(root, 'figures', folder, 'wells.csv'), '槽位,孔位,体积\nC1,A1,80\n')
  await writeFile(join(root, 'figures', folder, 'setup.html'), '<a id="animation" hidden>返回模拟动画</a><a href="setup.png" download>PNG</a><img src="setup.png"><script>oldNavigation()</script>')
  let revision = 1
  const store = { get: () => ({ revision, snapshot: { sessionId: 'session' }, protocolHash: 'hash' }),
    getChecks: () => [{ name: 'protocol-analysis', status: 'passed', taskId: 'task', protocolHash: 'hash', result: { analysisSha256: 'digest' } }] }
  const resources = new PreviewResources(store, root)
  resources.publish({ id: 'exp', revision: 1, sessionId: 'session', taskId: 'task', analysisSha256: 'digest', directory: root })
  const req = (resource, extra = {}) => new Request(`http://localhost/api/experiment-preview?${new URLSearchParams({ id: 'exp', revision: '1', session: 'session', task: 'task', resource, ...extra })}`)
  const page = await resources.fetch(req('setup'))
  assert.equal(page.status, 200)
  const html = await page.text()
  assert.match(html, /resource=setup-file/)
  assert.match(html, /resource=viewer/)
  assert.doesNotMatch(html, /<script>/)
  const png = await resources.fetch(req('setup-file', { file: 'setup.png' }))
  assert.equal(png.headers.get('content-type'), 'image/png')
  assert.equal(png.headers.get('cache-control'), 'private, no-store')
  assert.equal(await png.text(), 'png')
  assert.match(await (await resources.fetch(req('setup-file', { file: 'wells.csv' }))).text(), /C1,A1,80/)
  assert.equal((await resources.fetch(req('setup-file', { file: '../info.json' }))).status, 400)
  assert.equal((await resources.fetch(req('setup-file', { file: 'setup-2.png' }))).status, 404)
  assert.equal((await resources.fetch(req('setup', { session: 'other' }))).status, 404)
  assert.equal((await resources.fetch(req('setup-file', { file: 'setup.png', task: 'old' }))).status, 409)
  revision = 2
  assert.equal((await resources.fetch(req('setup'))).status, 409)
  revision = 1
  await writeFile(join(root, 'info.json'), JSON.stringify({ setup_figure: { ok: false } }))
  assert.match(await (await resources.fetch(req('setup'))).text(), /模拟动画仍可使用/)
  assert.equal((await resources.fetch(req('view'))).status, 200)
  await writeFile(join(root, 'info.json'), JSON.stringify({ setup_figure: { ok: true, folder: '../secret', files } }))
  assert.equal((await resources.fetch(req('setup'))).status, 500)
})
