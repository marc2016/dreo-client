# Proposal

## Why

While the `dreo` CLI currently supports direct non-interactive subcommands (`login`, `list`, `get`, `set`, `monitor`), users want an intuitive, guided interactive terminal UI. Integrating Inquirer allows users to simply run `dreo` or `dreo menu` and interactively select devices, toggle features (temperature, power, oscillation, modes), log in, and view live monitoring without needing to remember CLI flags or serial numbers.

## What Changes

- Add `@inquirer/prompts` as dependency for fast, lightweight interactive CLI prompts (select, input, password, confirm, number).
- Add interactive menu workflow when `dreo` is run with no subcommands or with `dreo menu` / `dreo interactive`.
- Main menu options:
  - 🔑 Login / Switch Account
  - 📋 List & Select Devices
  - ⚙️ Control Selected Device (Power, Target Temp, Heat/Eco Mode, Oscillation, Child Lock, Timer)
  - 📡 Live WebSocket Monitor
  - 🚪 Exit
- Retain backwards compatibility for non-interactive scripting subcommands (`login`, `list`, `get`, `set`, `monitor`).

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `cli`: Adds interactive menu requirement to guide users through all client operations using interactive prompts.

## Impact

- CLI entrypoint `bin/dreo.js` and a modular interactive menu controller `src/cli/menu.ts` (or `bin/interactive.js`).
- Dependency: `@inquirer/prompts`.
- Zero breaking changes to existing CLI flags and programmatic library API.

