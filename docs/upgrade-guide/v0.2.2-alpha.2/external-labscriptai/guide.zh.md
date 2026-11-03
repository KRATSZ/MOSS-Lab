---
kind: upgrade-guide
description: "MOSS 安装锁定的外部 LabscriptAI 插件，不再使用内嵌源码和虚拟环境。"
---

# 外部 LabscriptAI 插件

[English](guide.md) | 中文

## 变更

MOSS 使用公开的 MCP 产物接口 v1，替代内嵌 `labscriptai-ot/` 源码与 `.venv`。启动器内部的 `MOSS_FLEX_ROOT` 和 `MOSS_PYTHON` 值改为 `moss-model.patch.yml` 中的运行时配置。现有实验数据库和持久化分析仍可读取。

## 迁移

1. 停止 MOSS，备份 `.dsh-local/` 和 `.env`。
2. 执行 `pnpm install --frozen-lockfile` 和 `pnpm run build`；确保 Node 24.9+ 与 uv 可用。
3. 运行 `node moss-start.mjs`。启动器安装摘要锁定的插件，并使用插件自己的依赖安装器。核对启动日志中的版本和提交。
4. 打开已有实验，或执行 `node --import tsx/esm scripts/check-labscriptai.mjs`，检查分析及两种页面。自定义配置覆盖必须按 `moss-model.patch.yml` 的配置挂载 `internal/experiment/runtime-plugin.mjs`。
5. 旧虚拟环境不再使用；确认没有其他独立应用需要后再清理。版本更新和本地开发见 [MOSS 安装](../../../../MOSS-LAB.md)。
