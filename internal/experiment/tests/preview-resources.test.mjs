import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PreviewResources } from '../preview-resources.mjs'

test('serves only a published preview whose latest check and revision still match', async t => {
  const root = await mkdtemp(join(tmpdir(), 'preview-resources-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(join(root, 'animation.html'), '<html>animation</html>')
  await writeFile(join(root, 'setup.html'), '<html>setup</html>')
  await mkdir(join(root, 'downloads'))
  await writeFile(join(root, 'downloads', 'wells.csv'), 'well,volume\nA1,20\n')
  let revision = 1
  let checks = [{ name: 'protocol-analysis', status: 'passed', taskId: 'task', protocolHash: 'hash', result: { analysisSha256: 'digest' } }]
  const store = { get: () => ({ revision, snapshot: { sessionId: 'session' }, protocolHash: 'hash' }), getChecks: () => checks }
  const resources = new PreviewResources(store)
  const req = name => new Request(`http://localhost/api/experiment-preview?id=exp&revision=1&session=session&task=task&resource=${name}`)
  assert.deepEqual(await (await resources.fetch(req('status'))).json(), { status: 'waiting' })
  assert.equal((await resources.fetch(req('animation'))).status, 404)
  resources.publish({ id: 'exp', revision: 1, sessionId: 'session', taskId: 'task', analysisSha256: 'digest', directory: root, documents: { animation: true, setup: true }, files: [{ name: 'wells.csv', mime: 'text/csv' }] })
  resources.select('exp')
  assert.deepEqual(await (await resources.fetch(req('status'))).json(), { status: 'ready', id: 'exp', revision: 1, task: 'task', documents: { animation: true, setup: true }, files: [{ name: 'wells.csv', mime: 'text/csv' }] })
  assert.deepEqual(await (await resources.fetch(new Request('http://localhost/api/experiment-preview?resource=status&session=other'))).json(), { status: 'waiting' })
  assert.equal((await resources.fetch(new Request('http://localhost/api/experiment-preview?id=exp&revision=1&session=other&task=task&resource=animation'))).status, 404)
  const html = await resources.fetch(req('animation'))
  assert.equal(html.status, 200)
  assert.equal(await html.text(), '<html>animation</html>')
  assert.equal(await (await resources.fetch(req('setup'))).text(), '<html>setup</html>')
  assert.equal((await resources.fetch(new Request('http://localhost/api/experiment-preview?id=exp&revision=1&session=session&task=old&resource=animation'))).status, 409)
  assert.equal((await resources.fetch(req('../secret'))).status, 404)
  const download = await resources.fetch(req('file&file=wells.csv'))
  assert.equal(download.status, 200)
  assert.equal(download.headers.get('content-disposition'), 'attachment; filename="wells.csv"')
  assert.equal(await download.text(), 'well,volume\nA1,20\n')
  assert.equal((await resources.fetch(req('file&file=..%2Fsecret'))).status, 404)
  checks = [...checks, { ...checks[0], status: 'running', taskId: 'new' }]
  assert.equal((await resources.fetch(req('animation'))).status, 409)
  assert.deepEqual(await (await resources.fetch(req('status'))).json(), { status: 'waiting' })
  checks = checks.slice(0, 1)
  revision = 2
  assert.equal((await resources.fetch(req('animation'))).status, 409)
})
