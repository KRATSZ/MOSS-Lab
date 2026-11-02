# Xiaozhi MCP bridge

English | [中文](README.zh.md)

The local MOSS launch configuration mounts this Cordis plugin alongside the existing Web Agent. When `XIAOZHI_WSS_URL` is set, it opens one outbound secure WebSocket and exposes MCP tools. The address is a credential and is never logged. Without an endpoint the authenticated local workbench remains available. The socket does not automatically reconnect.

Voice delegation uses the `moss-experiment` preset named **实验助手**, with a laboratory persona and the four existing experiment tools. It does not mount the coding preset, shell, or repository-engineering instructions.

`moss_delegate(message, newExperiment=false)` forwards the user's words to the active experiment conversation. Supplementary conditions and parameter changes reuse that conversation; only an explicit new experiment creates another. Do not supply a session ID from the model. The deployment can choose an initial session with `sessionId`, otherwise the first request creates one in the existing workspace, or in the configured `workspacePath` when no workspace exists. The private `bindingPath` file records the active identity and navigation sequence using an atomic replacement. A subsequent message after restart uses that identity; a missing conversation or a saved coding preset is reported rather than silently replaced. Explicitly start a new experiment to adopt the experiment preset while preserving the old conversation.

`moss_task_status(jobId)` returns the observed Agent turn's state and final text, bounded to 4000 characters. `completed` means the Agent replied, including a clarification question; it never means a robot experiment completed. Only one delegated turn may be active. A timeout continues observation and keeps the concurrency slot until a terminal event. An ambiguous submission is kept observable. Shutdown stops observation, not the Agent. Job receipts are in memory and are lost on restart.

`moss_experiment_status(id)` reads the configured session, or the active delegated conversation when none was fixed. `moss_status` reports service availability, not hardware readiness. No robot execution tool is exposed by this bridge.

The same authenticated Connection carrier serves `GET /api/xiaozhi-workbench` with the latest navigation sequence, session, job, status and result. The Web client follows each accepted message once and opens its experiment panel before a preview is ready. Status polls do not repeatedly change the user's selection. `POST /api/xiaozhi-workbench/message` accepts JSON `{message, newExperiment?}` as a local text fallback through the same delegation service; a same-origin Origin header is required, and arbitrary session identities are rejected. It does not grant additional Agent permissions.

This is a single-operator deployment. The Xiaozhi endpoint does not provide a verified human identity; its holder can submit work with the Web Agent's existing local permissions. Session ownership checks are not user authentication. The deployer must keep the endpoint private and avoid duplicate bridge instances. No proactive notification or speech channel is implemented.

Run focused checks from the project root with Node 24.9 or later:

```sh
node --import tsx/esm --test internal/xiaozhi/*.test.mjs
```

Hardware microphone recognition, the hosted endpoint's tool selection and disconnect recovery require separate physical-device verification. Local HTTP/MCP injection and browser checks do not establish those behaviors or robot readiness.
