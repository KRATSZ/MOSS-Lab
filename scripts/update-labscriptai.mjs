/** Propose published, compatible plugin releases by updating the checksum lock only. */
import { readFile, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { boundedResponse, validateLock } from './labscriptai-runtime.mjs'

const REPOSITORY = 'KRATSZ/labscriptai-ot'
const newer = (candidate, current) => {
  const a = candidate.split('.').map(Number)
  const b = current.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return false
}

/** Select a compatible published release; prereleases, drafts, and downgrades never update the lock.
 * @param {object} current Existing validated lock.
 * @param {Function} fetcher Network provider, omitted uses fetch.
 * @returns {Promise<object>} Status and candidate lock only when an update is available.
 */
export async function findPluginUpdate(current, fetcher = fetch) {
  validateLock(current)
  const get = async url => {
    const response = await fetcher(url, { signal: AbortSignal.timeout(30000), headers: { Accept: 'application/vnd.github+json' } })
    return JSON.parse((await boundedResponse(response, 1024 * 1024)).toString('utf8'))
  }
  const release = await get(`https://api.github.com/repos/${REPOSITORY}/releases/latest`)
  if (release.draft || release.prerelease || !/^v\d+\.\d+\.\d+$/.test(release.tag_name)) return { status: 'current' }
  const version = release.tag_name.slice(1)
  if (!newer(version, current.version) && !(version === current.version && current.kind === 'source')) return { status: 'current' }
  const prefix = `https://github.com/${REPOSITORY}/releases/download/${release.tag_name}/`
  const manifestAsset = release.assets?.find(asset => asset.name === 'release-manifest.json')
  if (manifestAsset?.browser_download_url !== prefix + 'release-manifest.json') throw new Error('Release has no trusted checksum manifest')
  const manifest = await get(manifestAsset.browser_download_url)
  if (manifest.version !== version) throw new Error('Release manifest version mismatch')
  if (manifest.artifact_api !== current.artifact_api) return { status: 'unsupported_api', version, artifact_api: manifest.artifact_api ?? null, expected_artifact_api: current.artifact_api }
  const name = `labscriptai-ot-${version}.zip`
  const asset = manifest.assets?.find(item => item.name === name)
  const url = prefix + name
  if (!release.assets?.some(item => item.name === name && item.browser_download_url === url) || !asset) throw new Error('Release archive is missing')
  const lock = validateLock({ schema: 1, artifact_api: current.artifact_api, version, kind: 'release', revision: release.tag_name, url, sha256: asset.sha256 })
  return { status: 'updated', lock }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = resolve('labscriptai-ot.lock.json')
  const result = await findPluginUpdate(validateLock(JSON.parse(await readFile(path, 'utf8'))))
  if (result.status === 'updated') {
    await writeFile(path + '.tmp', JSON.stringify(result.lock, null, 2) + '\n', { flag: 'wx' })
    await rename(path + '.tmp', path)
  }
  if (process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT, `changed=${result.status === 'updated'}\n`, { flag: 'a' })
  const { lock, ...decision } = result
  console.log(JSON.stringify(lock ? { ...decision, version: lock.version } : decision))
}
