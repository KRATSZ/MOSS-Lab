import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const NO_STORE = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
const RESOURCE = '/api/experiment-preview'
const failure = status => new Response(null, { status, headers: NO_STORE })

/** Serves only published previews. The surrounding connection route must authenticate owner peers. */
export class PreviewResources {
  constructor(store, resourcePath = RESOURCE) {
    this.store = store
    this.resourcePath = resourcePath
    this.previews = new Map()
    this.selected = new Map()
  }

  publish(preview) {
    this.previews.set(preview.id, preview)
  }

  select(id) {
    const preview = this.previews.get(id)
    if (!preview) throw new Error('preview not published')
    this.selected.set(preview.sessionId, id)
  }

  withdraw(id) {
    const preview = this.previews.get(id)
    this.previews.delete(id)
    if (preview && this.selected.get(preview.sessionId) === id) this.selected.delete(preview.sessionId)
  }

  isCurrent(preview) {
    const experiment = this.store.get(preview.id)
    const last = this.store.getChecks(preview.id, preview.revision).filter(check => check.name === 'protocol-analysis').at(-1)
    return experiment.revision === preview.revision && experiment.snapshot.sessionId === preview.sessionId && !!last && last.status === 'passed' && last.taskId === preview.taskId && last.protocolHash === experiment.protocolHash && last.result?.analysisSha256 === preview.analysisSha256
  }

  async fetch(request) {
    if (request.method !== 'GET') return failure(405)
    const url = new URL(request.url)
    const id = url.searchParams.get('id')
    const revision = Number(url.searchParams.get('revision'))
    const resource = url.searchParams.get('resource')
    const sessionId = url.searchParams.get('session')
    if (!sessionId) return failure(400)
    try {
      if (resource === 'status') {
        const selected = this.previews.get(this.selected.get(sessionId))
        const status = selected && this.isCurrent(selected) ? { status: 'ready', id: selected.id, revision: selected.revision, task: selected.taskId, documents: selected.documents, files: selected.files } : { status: 'waiting' }
        return Response.json(status, { headers: NO_STORE })
      }
      if (!id || !Number.isSafeInteger(revision) || revision < 1 || !resource) return failure(400)
      const preview = this.previews.get(id)
      if (!preview || preview.revision !== revision || preview.sessionId !== sessionId) return failure(404)
      if (url.searchParams.get('task') !== preview.taskId || !this.isCurrent(preview)) return failure(409)
      if (resource === 'file') {
        const name = url.searchParams.get('file')
        const file = preview.files.find(item => item.name === name)
        if (!file) return failure(404)
        const bytes = await readFile(join(preview.directory, 'downloads', file.name))
        if (!this.isCurrent(preview)) return failure(409)
        return new Response(bytes, { headers: { ...NO_STORE, 'Content-Type': file.mime, 'Content-Disposition': `attachment; filename="${file.name}"`, 'Content-Security-Policy': "default-src 'none'" } })
      }
      if (!['animation', 'setup'].includes(resource) || !preview.documents[resource]) return failure(404)
      const bytes = await readFile(join(preview.directory, `${resource}.html`))
      if (!this.isCurrent(preview)) return failure(409)
      return new Response(bytes, { headers: { ...NO_STORE, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'self'" } })
    } catch (error) {
      if (error?.code === 'NOT_FOUND' || error?.code === 'ENOENT') return failure(404)
      return failure(500)
    }
  }
}
