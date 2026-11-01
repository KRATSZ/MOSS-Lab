# MOSS Lab

[English](README.md) | 中文

MOSS Lab 将网页 AI 智能体、本地 Opentrons 协议模拟和交互式 Flex 3D 预览整合在同一个项目中。项目基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)，并包含 [LabscriptAI OT](https://github.com/KRATSZ/labscriptai-ot) 的源码快照。

> **项目状态：** 实验阶段。模拟或动画不能证明实验准确、设备就绪或物理操作安全。机器人状态按钮仅读取设备信息；此集成不会发起机器人运行。

## 功能

- 使用 Agent 模式执行任务，使用调研模式进行对话和研究。
- 在本地编写、分析 Opentrons 协议，并在网页中查看 Flex 3D 动画。
- 通过配置的小智 MCP 连接委派任务并查询状态。
- 按需查询兼容机器人服务的健康和移液器接口。

## 环境要求

- Node.js 24.9 或更高版本，以及 pnpm 11.28.5。
- [uv](https://docs.astral.sh/uv/) 和 Python 3.11–3.13。
- 兼容 OpenAI Chat Completions 的 HTTPS 模型接口及凭据。
- 当前启动配置需要小智 MCP WSS 地址；兼容的机器人服务为可选项。

## 快速开始

在项目根目录安装依赖并构建网页应用：

```sh
pnpm install
pnpm run build
uv sync --project labscriptai-ot --locked
```

将 `.env.example` 复制为 `.env` 并填写必需的配置。WSS 地址和模型密钥属于凭据，请勿公开该文件。`OPENTRONS_URL` 为可选项，须指向支持 `GET /health` 和 `GET /instruments` 的服务。

```sh
cp .env.example .env
node moss-start.mjs
```

打开启动器输出的认证链接。本地会话、实验记录和生成的预览保存在 `.dsh-local/`。详细配置和旧数据迁移方法见 [MOSS Lab 配置与迁移](MOSS-LAB.md)。

## 项目结构

- `moss-start.mjs` 和 `moss-model.patch.yml` 负责启动和配置网页智能体。
- `internal/` 包含实验、预览、机器人状态和小智接入代码。
- `labscriptai-ot/` 包含机器人源码、模拟依赖和 Flex3D 资源。
- `packages/`、`apps/` 和 `vendor/` 包含 DeepSeek Harness 组件及其依赖。

## 来源与引用

MOSS Lab 基于 DeepSeek AI 的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 和 [LabscriptAI OT](https://github.com/KRATSZ/labscriptai-ot)。项目内的 LabscriptAI OT 源码快照基于提交 `a3182eb5befc8ce535c33a225ae80b287e87c211`，并包含本地播放器修改。

使用 LabscriptAI OT 时必须引用：

> Gao, Yuan et al. “Autonomous Liquid-handling Robotics Scripting for Accessible and Responsible Protein Engineering.” bioRxiv, 2025. [doi:10.1101/2025.09.30.679666](https://doi.org/10.1101/2025.09.30.679666).

另见 [LabscriptAI OT 引用元数据](labscriptai-ot/CITATION.cff)和 [DeepSeek Harness 引用方式](https://github.com/deepseek-ai/deepseek-harness#citation)。

## 许可证

本仓库包含不同许可证的组件。DeepSeek Harness 使用 [MIT 许可证](LICENSE)。`labscriptai-ot/` 下的代码和资源保留 [LabscriptAI Research Citation License v1.0](labscriptai-ot/LICENSE)，要求引用，商业使用需取得书面许可；该许可不是 OSI 认证的开源许可证。随附的协议库包含第三方示例，其各自的再分发条款尚未逐项核实。重新分发或使用前，请查看适用的组件许可证和[第三方声明](THIRD_PARTY_NOTICES.md)。
