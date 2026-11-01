# 小智 MCP 桥接

[English](README.md) | 中文

此内部 Cordis 插件由本地启动配置启用。插件读取项目根目录 `.env` 中的 `XIAOZHI_WSS_URL`，主动建立一条 WSS 连接，地址和凭据不会写入日志。只支持 `wss:`；连接关闭后不自动重连，卸载插件时关闭连接。

桥接以 WebSocket 文本消息交换 MCP JSON-RPC。已连接配置的接入点观察到 `initialize`、`notifications/initialized` 和 `tools/list` 请求并收到工具清单。硬件语音调用和断线恢复尚未验证。没有主动通知或语音播报能力。

插件注入 `experimentStore`、`sessionController` 和 `workspaceRegistry`。只读工具绑定到部署者选定的一个 `sessionId`；启动配置将其设为 null，状态工具可用，实验查询会明确提示未绑定，小智请求不能选择会话。可信部署者可将其改为一个明确允许的会话：

```yaml
- insert:
    - id: xiaozhi-readonly
      name: file:///absolute/path/to/internal/xiaozhi/plugin.mjs
      config:
        sessionId: REPLACE_WITH_AUTHORIZED_SESSION_ID
```

`sessionId` 必须由受信任的部署者选定，并与小智端的使用者及其允许访问的网页会话对应。存储的会话检查不是身份认证；当前没有自动绑定或验证小智用户身份的机制，不适合共享或多用户部署。地址相当于访问凭据，应只由受信任的部署者持有。单个插件实例创建一个连接，部署者负责避免重复加载实例。

工具包含 `moss_status`、`moss_experiment_status`、`moss_delegate` 和 `moss_task_status`。`moss_experiment_status` 要求调用方提供实验 ID，仅查询所选会话内当前版本和最多 20 项最新检查状态，不返回协议、会话内容或检查结果。检查记录是存储数据，不证明设备就绪或运行安全。`moss_delegate` 以不超过 8000 字节的文字委派到第一个工作区中使用 Agent 模式的新会话，标题为带时间戳的小智委派实验，并以 `来自小智的委派：…` 提交给本地网页 Agent；委派内容在网页会话列表中可见，该会话的实验动画也会在此打开。同一时刻只允许一个委派任务在执行；内存中最多保留 100 条已完成任务。`moss_task_status` 按任务 ID 返回 `running`、`completed`、`error` 或 `timeout`；`completed` 携带 Agent 的最终答复文字（最多 4000 字符），`timeout` 表示五分钟等待已超时；任务仍视为活跃并阻止新的委派，直到收到其终态事件。桥接会继续跟踪任务并在结束时更新状态。提交报错时任务是否已入队可能无法确定；返回的任务会继续保持活跃并被跟踪，使用者应查看网页会话。如果始终没有收到终态事件，该任务会占用并发名额直到桥接关闭。关闭桥接会停止跟踪，但不会停止网页任务；任务结果可能未知。任务记录保存在内存中，重启后丢失。

委派内容以网页 Agent 的全部本地权限在新建工作区会话中执行；小智不提供已验证的用户身份，因此委派仅限运行网页应用的同一受信任使用者。此插件不公开真机控制。

本地测试不建立外部连接，在 `LabScriptAI-OT-V3` 应用目录运行：

```sh
node --import tsx/esm --test internal/xiaozhi/bridge.test.mjs internal/xiaozhi/delegation.test.mjs
```

还需要验证小智硬件的工具调用、会话身份绑定和重连行为；如需主动播报，还须确认平台提供的通知接口并单独实现验证。
