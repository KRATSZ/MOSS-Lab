---
kind: upgrade-guide
description: "MOSS installs the locked external LabscriptAI plugin instead of using the embedded source and virtual environment."
---

# External LabscriptAI plugin

English | [中文](guide.zh.md)

## Change

MOSS uses public MCP artifact API v1 instead of the embedded `labscriptai-ot/` source and `.venv`. The internal `MOSS_FLEX_ROOT` and `MOSS_PYTHON` startup values are replaced by the runtime configuration in `moss-model.patch.yml`. Opening an existing experiment database upgrades it to schema 3 to save robot run receipts. Existing experiments and saved analyses remain readable. Older MOSS builds cannot open the upgraded database.

## Migration

1. Stop MOSS and back up `.dsh-local/` and `.env`.
2. Run `pnpm install --frozen-lockfile` and `pnpm run build`; keep Node 24.9+ and uv available.
3. Start `node moss-start.mjs`. It installs the checksum-pinned plugin and uses its dependency installer. Check the plugin version and revision printed at startup. Keep the pre-upgrade database backup if you need to return to an older MOSS build.
4. Open an existing experiment or run `node --import tsx/esm scripts/check-labscriptai.mjs` to verify analysis and both documents. Custom profile overlays must mount `internal/experiment/runtime-plugin.mjs` using the same configuration as `moss-model.patch.yml`.
5. The old virtual environment is unused. Remove it only after checking that no independent application needs it. See [MOSS setup](../../../../MOSS-LAB.md) for version updates and local development.
