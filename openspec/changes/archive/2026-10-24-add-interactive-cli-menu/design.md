# Design

## Context

See `proposal.md` for motivation. The existing CLI (`bin/dreo.js`) accepts command-line arguments and flags (`login`, `list`, `get`, `set`, `monitor`). Users want a menu-driven terminal experience so they can explore devices and trigger controls interactively without manual flags.

## Goals / Non-Goals

**Goals:**
- Provide an interactive, navigable terminal UI using `@inquirer/prompts`.
- Present a persistent main menu loop with easy navigation between devices, controls, settings, and live telemetry.
- Support device-specific interactive submenus (e.g., thermostat temperature slider/input, mode picker, oscillation switch for heaters and fans).
- Maintain 100% backwards compatibility for non-interactive flag-based commands.

**Non-Goals:**
- Building a full-screen TUI (like Blessed/Ink) with split panes; simple sequential Inquirer prompts are lightweight, reliable, and standard.

## Decisions

### 1. Modern `@inquirer/prompts` over Legacy `inquirer`
- **Choice:** Use `@inquirer/prompts` (`select`, `input`, `password`, `confirm`, `number`).
- **Alternatives Considered:** Monolithic `inquirer` v9/v10 or `prompts`.
- **Rationale:** `@inquirer/prompts` is the modern, official Inquirer rewrite. It is pure ESM, modular, zero-bloat, and supports modern Node.js runtimes seamlessly.

### 2. Interactive Menu Structure & Loop Pattern
- **Choice:** An async loop with sub-menus:
  ```
  [Main Menu]
    ├── 1. 📋 List & Select Device
    │       └── [Device Menu: <Device Name>]
    │             ├── Toggle Power
    │             ├── Set Target Temp (Heaters)
    │             ├── Set Mode / Heat Level (Heaters)
    │             ├── Set Fan Speed (Fans)
    │             ├── Toggle Oscillation
    │             ├── Toggle Child Lock
    │             ├── Set Timer
    │             └── ⬅️ Back to Main Menu
    ├── 2. 📡 Start Live WebSocket Monitor (Press enter/q to return)
    ├── 3. 🔑 Account & Login (Switch account / change region)
    └── 4. 🚪 Exit
  ```
- **Rationale:** Allows users to perform multiple operations continuously without restarting the CLI.

### 3. TTY Detection & Subcommand Preservation
- **Choice:** When arguments are passed (e.g. `dreo list`), run the direct subcommand. When invoked without arguments in an interactive terminal (`process.stdin.isTTY`), launch the interactive menu. If piped/non-TTY, display `--help`.
- **Rationale:** Preserves shell automation and scripting while offering interactive comfort for humans.

## Risks / Trade-offs

- **[Risk] Non-TTY or piped execution** → Inquirer prompts crash or hang if stdin is not a TTY.  
  *Mitigation:* Check `process.stdin.isTTY`. If false and no arguments given, print help and exit cleanly.
- **[Risk] WebSocket Monitor exiting cleanly in interactive loop** → Real-time stream needs to be stoppable without killing the CLI process.  
  *Mitigation:* In the interactive monitor view, listen for a keypress/return to call `client.stopMonitoring()` and gracefully return to the main menu.

