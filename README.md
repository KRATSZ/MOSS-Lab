# MOSS Lab

English | [中文](README.zh.md)

MOSS Lab brings a web-based AI agent, local Opentrons protocol simulation, and interactive Flex 3D previews together in one project. It builds on [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) and includes a source snapshot of [LabscriptAI OT](https://github.com/KRATSZ/labscriptai-ot).

> **Project status:** Experimental. A simulation or animation does not establish experimental accuracy, device readiness, or physical safety. The robot status button only reads device information; this integration does not initiate robot runs.

## Features

- Use Agent mode for executable tasks and Research mode for conversation and investigation.
- Draft and analyze Opentrons protocols locally, then inspect a Flex 3D animation in the web interface.
- Delegate tasks through a configured Xiaozhi MCP connection and follow their status.
- Query supported robot health and instrument endpoints on request.

## Requirements

- Node.js 24.9 or later and pnpm 11.28.5.
- [uv](https://docs.astral.sh/uv/) and Python 3.11–3.13.
- An OpenAI Chat Completions-compatible HTTPS model endpoint and credentials.
- A Xiaozhi MCP WSS endpoint for the current launch configuration; a compatible robot service is optional.

## Getting started

From the repository root, install dependencies and build the web application:

```sh
pnpm install
pnpm run build
uv sync --project labscriptai-ot --locked
```

Copy `.env.example` to `.env` and fill in the required values. The WSS address and model key are credentials; keep the file private. `OPENTRONS_URL` is optional and must point to a service that supports `GET /health` and `GET /instruments`.

```sh
cp .env.example .env
node moss-start.mjs
```

Open the authentication URL printed by the launcher. Local sessions, experiment records, and generated previews are stored in `.dsh-local/`. See [MOSS Lab setup and migration](MOSS-LAB.md) for details.

## Project layout

- `moss-start.mjs` and `moss-model.patch.yml` start and configure the web agent.
- `internal/` contains the experiment, preview, robot status, and Xiaozhi integration.
- `labscriptai-ot/` contains the robot source, simulation dependencies, and Flex3D assets.
- `packages/`, `apps/`, and `vendor/` contain DeepSeek Harness components and their dependencies.

## Sources and citation

MOSS Lab builds on [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) by DeepSeek AI and [LabscriptAI OT](https://github.com/KRATSZ/labscriptai-ot). The included LabscriptAI OT snapshot is based on commit `a3182eb5befc8ce535c33a225ae80b287e87c211`, with local viewer changes.

Use of LabscriptAI OT requires the following citation:

> Gao, Yuan et al. “Autonomous Liquid-handling Robotics Scripting for Accessible and Responsible Protein Engineering.” bioRxiv, 2025. [doi:10.1101/2025.09.30.679666](https://doi.org/10.1101/2025.09.30.679666).

See [LabscriptAI OT citation metadata](labscriptai-ot/CITATION.cff) and [DeepSeek Harness citation](https://github.com/deepseek-ai/deepseek-harness#citation).

## License

This repository contains components with different licenses. DeepSeek Harness is covered by the [MIT license](LICENSE). Code and assets under `labscriptai-ot/` retain the [LabscriptAI Research Citation License v1.0](labscriptai-ot/LICENSE), which requires citation and written permission for commercial use; it is not an OSI-approved open-source license. The bundled protocol library contains third-party examples whose individual redistribution terms have not been verified. Review the applicable component licenses and [third-party notices](THIRD_PARTY_NOTICES.md) before redistribution or use.
