# Xiaozhi MCP bridge

English | [中文](README.zh.md)

This internal Cordis plugin is enabled by the local launch configuration. It reads `XIAOZHI_WSS_URL` from the project root `.env`, opens one outbound WSS connection, and never logs the address or credential. Only `wss:` is accepted; the connection does not reconnect after closing, and unloading the plugin closes it.

The bridge exchanges MCP JSON-RPC over WebSocket text messages. A connected endpoint has been observed sending `initialize`, `notifications/initialized`, and `tools/list`, and receives the tool list. Voice calls from the hardware and disconnect recovery are not yet verified. There are no proactive notifications or voice announcements.

The plugin injects `experimentStore`, `sessionController`, and `workspaceRegistry`. The read tools are bound to one operator-selected `sessionId`; the launch configuration leaves it null, so status tools answer but experiment queries report the unbound state, and Xiaozhi cannot choose a session. A trusted deployer may bind one explicitly allowed session:

```yaml
- insert:
    - id: xiaozhi-readonly
      name: file:///absolute/path/to/internal/xiaozhi/plugin.mjs
      config:
        sessionId: REPLACE_WITH_AUTHORIZED_SESSION_ID
```

`sessionId` must be chosen by a trusted deployer and correspond to the Xiaozhi-side user and the web session that user may see. Stored session checks are not authentication; there is no mechanism to bind or verify a Xiaozhi user identity, so this is not suitable for shared or multi-user deployment. The address is an access credential and must be held only by the trusted deployer. One plugin instance creates one connection; the deployer avoids loading duplicate instances.

The tools are `moss_status`, `moss_experiment_status`, `moss_delegate`, and `moss_task_status`. `moss_experiment_status` requires an experiment id and reads only the current revision and the latest twenty check statuses of that session; it never returns protocols, conversation content, or check results. Check records are stored data, not proof of device readiness or run safety. `moss_delegate` sends a text message of at most 8000 bytes as a new session using Agent mode in the first listed workspace, titled 小智委派实验 with a timestamp, and submits it to the local web agent as `来自小智的委派：…`; the message is visible in the web session list, and the session's experiment animation opens there. Only one delegated job may run at a time; up to 100 finished jobs are retained in memory. `moss_task_status` reports `running`, `completed`, `error`, or `timeout` by job id; `completed` carries the agent's final answer text (at most 4000 characters), and `timeout` means the five-minute wait elapsed; the job remains active and blocks another delegation until its terminal event arrives. The bridge keeps tracking the job and updates its status when it finishes. A prompt submission error can leave admission uncertain; the returned job remains active for tracking, and the operator should inspect its web session. If no terminal event arrives, it continues to occupy the slot until the bridge closes. Closing the bridge stops observation but does not stop the web task; its outcome may be unknown. Job records are in memory and do not survive a restart.

A delegated message runs with the web agent's full local authority in a new workspace session; Xiaozhi supplies no verified user identity, so delegation is limited to the same single trusted operator that runs the web app. The plugin exposes no real-device control.

Local tests build no external connection; run them from the `LabScriptAI-OT-V3` application directory:

```sh
node --import tsx/esm --test internal/xiaozhi/bridge.test.mjs internal/xiaozhi/delegation.test.mjs
```

Tool calls from the Xiaozhi hardware, session identity binding, and reconnection behavior still need verification; proactive announcements would require confirming a platform notification interface and implementing it separately.
