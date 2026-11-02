import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { fileURLToPath } from 'node:url'
import { connectBridge } from './bridge.mjs'
import { createDelegation } from './delegation.mjs'
import { registerWorkbench } from './workbench-route.mjs'

export const name = 'xiaozhi-readonly'
export const inject = ['experimentStore', 'sessionController', 'workspaceRegistry', 'connection', 'sessionPersistence']

/** Mount an opt-in connection for one explicitly selected session.
 * @param {object} ctx Cordis context with the experiment store.
 * @param {{ sessionId: string }} config Session authorized by the operator for this endpoint.
 */
export function apply(ctx, config) {
  if (!config || (config.sessionId !== null && (typeof config.sessionId !== 'string' || !config.sessionId.trim()))) throw new Error('xiaozhi-readonly requires a sessionId or null')
  ctx.effect(() => {
    let endpoint = process.env.XIAOZHI_WSS_URL
    if (endpoint === undefined) {
      try { endpoint = parseEnv(readFileSync(fileURLToPath(new URL('../../.env', import.meta.url)), 'utf8')).XIAOZHI_WSS_URL }
      catch (error) { if (error.code !== 'ENOENT') throw new Error('xiaozhi could not read the project .env') }
    }
    const delegation = createDelegation({ controller: ctx.sessionController, workspaces: ctx.workspaceRegistry, events: ctx, sessionId: config.sessionId, bindingPath: config.bindingPath ?? null, workspacePath: config.workspacePath ?? null, agentPreset: config.agentPreset ?? 'standard',
      validateSession: async (id, preset) => {
        const saved = await ctx.sessionPersistence.stat(id)
        if (!saved) throw new Error('原实验会话不存在，请检查记录或明确开始新实验。')
        if ((saved.header.agentPreset ?? 'standard') !== preset) throw new Error('旧会话的模式与实验助手不一致，请明确开始新实验；旧对话记录会保留。')
      } })
    let disconnect, unregister
    try {
      unregister = registerWorkbench(ctx.connection, delegation)
      if (endpoint) disconnect = connectBridge({ url: endpoint, sessionId: config.sessionId, store: ctx.experimentStore, delegation })
    } catch (error) {
      void unregister?.(); delegation.close(); throw error
    }
    return async () => { disconnect?.(); await unregister?.(); delegation.close() }
  }, 'xiaozhi-readonly.connection')
}
