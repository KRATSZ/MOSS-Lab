/** Delegate protocol analysis to the public, confined LabscriptAI MCP adapter. */
export const name = 'protocol-analyzer'
export const inject = ['labscriptaiRuntime']

/** Publish the analysis service consumed by the experiment workflow. */
export function apply(ctx) {
  ctx.effect(() => ctx.provide('protocolAnalyzer', {
    analyze(protocol) { return ctx.labscriptaiRuntime.analyze(protocol) },
  }), 'protocol-analyzer.service')
}
