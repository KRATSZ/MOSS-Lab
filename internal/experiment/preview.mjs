import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { ExperimentError } from './index.mjs'

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const MAX_ANALYSIS_BYTES = 16 * 1024 * 1024

/**
 * Build a temporary scene only from a current, successfully completed analysis.
 * The check producer must create the analysis itself and store its full digest in
 * result.analysisSha256; arbitrary caller-supplied check results are not trusted.
 * The caller owns the returned directory and must remove it when finished.
 */
export async function buildPreview({ store, id, revision, sessionId, analysis, runtime, temporaryRoot }) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) throw new ExperimentError('INVALID_INPUT', 'a session id is required')
  if (!Buffer.isBuffer(analysis) || analysis.length === 0 || analysis.length > MAX_ANALYSIS_BYTES) {
    throw new ExperimentError('INVALID_INPUT', 'analysis must be a bounded nonempty byte buffer')
  }
  const capturedAnalysis = Buffer.from(analysis)
  const digest = sha256(capturedAnalysis)
  const verify = () => {
    const current = store.get(id)
    if (current.revision !== revision || !current.protocolHash || current.snapshot.sessionId !== sessionId) throw new ExperimentError('STALE_TASK', 'preview does not belong to the current experiment revision and session')
    const checks = store.getChecks(id, revision).filter(check => check.name === 'protocol-analysis')
    const latest = checks.at(-1)
    if (!latest || latest.status !== 'passed' || latest.protocolHash !== current.protocolHash || latest.result?.analysisSha256 !== digest) {
      throw new ExperimentError('PREVIEW_NOT_READY', 'current protocol has no matching successful analysis')
    }
    return latest.taskId
  }
  const taskId = verify()
  const directory = await mkdtemp(join(resolve(temporaryRoot), 'flex-preview-'))
  try {
    const documents = await runtime.documents(capturedAnalysis)
    if (!documents.animation && !documents.setup) throw new ExperimentError('PREVIEW_FAILED', 'plugin returned no usable documents')
    for (const name of ['animation', 'setup']) if (documents[name]) await writeFile(join(directory, `${name}.html`), documents[name], { mode: 0o600, flag: 'wx' })
    await mkdir(join(directory, 'downloads'))
    for (const file of documents.files) await writeFile(join(directory, 'downloads', file.name), file.bytes, { mode: 0o600, flag: 'wx' })
    if (verify() !== taskId) throw new ExperimentError('STALE_TASK', 'protocol analysis changed while building the preview')
    return { id, revision, sessionId, taskId, analysisSha256: digest, directory, documents: { animation: !!documents.animation, setup: !!documents.setup }, files: documents.files.map(({ name, mime }) => ({ name, mime })) }
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }
}
