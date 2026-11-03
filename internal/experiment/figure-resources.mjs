import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const FILE = /^(setup(?:-[1-9][0-9]*)?\.png|setup\.html|setup\.json|wells\.csv)$/
const HEADERS = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
const HTML_HEADERS = { ...HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; frame-ancestors 'self'" }
const attribute = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')

/**
 * Serve setup artifacts after the caller checks session, revision and analysis task.
 * @param {{directory: string, resource: string, file: string | null, address: (name: string) => string}} input Authenticated preview location and URLs.
 * @returns {Promise<Response>} Setup HTML, a permitted artifact, or a visible drawing failure.
 */
export async function fetchFigure({ directory, resource, file, address }) {
  const info = JSON.parse(await readFile(join(directory, 'info.json'), 'utf8'))
  const figure = info.setup_figure
  if (!figure?.ok) {
    if (resource !== 'setup') return new Response(null, { status: 503, headers: HEADERS })
    return new Response(`<!doctype html><meta charset="utf-8"><title>实验配置图</title><p>配置图暂时无法生成，模拟动画仍可使用。请重新分析后重试。</p><a href="${attribute(address('viewer'))}">返回模拟动画</a>`, { headers: HTML_HEADERS })
  }
  if (!/^[a-f0-9]{20}-[a-f0-9]{12}$/.test(figure.folder) || !Array.isArray(figure.files) || !figure.files.every(name => typeof name === 'string' && FILE.test(name))) {
    return new Response(null, { status: 500, headers: HEADERS })
  }
  const folder = join(directory, 'figures', figure.folder)
  if (resource === 'setup') {
    let html = await readFile(join(folder, 'setup.html'), 'utf8')
    html = html.replace(/(href|src)="(setup(?:-[1-9][0-9]*)?\.png|setup\.json|wells\.csv)"/g,
      (_, attr, name) => `${attr}="${attribute(address('setup-file') + '&file=' + encodeURIComponent(name))}"`)
    html = html.replace('<a id="animation" hidden>', `<a id="animation" href="${attribute(address('viewer'))}">`)
    html = html.replace(/<script>[\s\S]*?<\/script>/g, '')
    return new Response(html, { headers: HTML_HEADERS })
  }
  if (!file || !FILE.test(file) || file === 'setup.html') return new Response(null, { status: 400, headers: HEADERS })
  if (!figure.files.includes(file)) return new Response(null, { status: 404, headers: HEADERS })
  const contentType = file.endsWith('.png') ? 'image/png' : file.endsWith('.csv') ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8'
  return new Response(await readFile(join(folder, file)), { headers: { ...HEADERS, 'Content-Type': contentType } })
}
