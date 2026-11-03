/** A bounded set of resources belonging to one checked experiment revision. */
export interface PreviewBundle {
  readonly document: string | null
  readonly setupDocument: string | null
  readonly files: readonly string[]
}

const MAX_FILE = 64 * 1024 * 1024
const MAX_TOTAL = 128 * 1024 * 1024

type Resource = 'animation' | 'setup'

/** Fetch portable plugin documents, keeping partial availability and verifying the revision again.
 * @param session Owning session.
 * @param id Experiment identifier.
 * @param revision Checked revision.
 * @param task Analysis task identifier.
 * @param signal Cancellation signal.
 * @param endpoint Authenticated preview or demo endpoint; omitted selects the preview.
 * @returns Bounded documents from one current check, without rewriting their content.
 */
export async function fetchPreviewBundle(session: string, id: string, revision: number, task: string, signal: AbortSignal, endpoint: '/api/experiment-preview' | '/api/experiment-demo' = '/api/experiment-preview'): Promise<PreviewBundle> {
  let total = 0
  async function read(resource: Resource): Promise<string | null> {
    const params = new URLSearchParams({ id, revision: String(revision), session, task, resource })
    const response = await fetch(`${endpoint}?${params}`, { signal, credentials: 'same-origin', cache: 'no-store' })
    if (response.status === 404 || response.status === 503) return null
    if (!response.ok || response.body === null) throw new Error('Preview resource unavailable')
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let length = 0
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        length += chunk.value.byteLength
        total += chunk.value.byteLength
        if (length > MAX_FILE || total > MAX_TOTAL) throw new Error('Preview resource exceeds size limit')
        chunks.push(chunk.value)
      }
    } catch (error) {
      await reader.cancel().catch((cancelError: unknown) => { console.error('Preview stream cancellation failed', cancelError) })
      throw error
    } finally {
      reader.releaseLock()
    }
    const result = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength }
    return new TextDecoder('utf-8', { fatal: true }).decode(result)
  }
  const document = await read('animation')
  const setupDocument = await read('setup')
  if (document === null && setupDocument === null) throw new Error('Preview documents unavailable')
  const statusParams = new URLSearchParams(endpoint === '/api/experiment-demo' ? { resource: 'status' } : { resource: 'status', session })
  const response = await fetch(`${endpoint}?${statusParams}`, { signal, credentials: 'same-origin', cache: 'no-store' })
  if (!response.ok) throw new Error('Preview status unavailable')
  const status: unknown = await response.json()
  if (typeof status !== 'object' || status === null || !('status' in status) || status.status !== 'ready'
    || !('id' in status) || status.id !== id || !('revision' in status) || status.revision !== revision
    || !('task' in status) || status.task !== task) {
    throw new Error('Experiment changed during preview load')
  }
  const entries: unknown = 'files' in status ? status.files : []
  if (!Array.isArray(entries) || entries.length > 64) throw new Error('Invalid preview files')
  const files: string[] = []
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null || !('name' in entry) || typeof entry.name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(entry.name)) throw new Error('Invalid preview filename')
    files.push(entry.name)
  }
  return { document, setupDocument, files }
}
