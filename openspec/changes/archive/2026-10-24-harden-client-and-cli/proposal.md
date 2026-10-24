# Proposal

## Why

A review of the current client and CLI found several defects that break everyday use: `dreo set` and the interactive menu never exit after a device command because an implicitly opened WebSocket keeps the process alive, a WebSocket reconnect race leaks sockets and reports a wrong connection state, and Dreo API errors (HTTP 200 with a non-zero `code`) are silently swallowed, so an expired token shows up as "No devices found". Alongside these, a set of smaller inconsistencies (CLI `set` sending wrong parameter keys, missing temperature validation, duplicated auth header, CLI code bundled into the library entry point) make the package less reliable than its specs promise.

## What Changes

- **WebSocket lifecycle for commands**: A WebSocket connection opened implicitly to deliver a device command no longer keeps the process alive indefinitely. It is closed after a short idle period unless monitoring was started explicitly. A new `client.close()` releases all connections and timers.
- **CLI exits cleanly**: `dreo set`, `dreo get`, `dreo list` and the interactive menu release all client resources before exiting. Ctrl+C in the interactive menu ends the program without a stack trace.
- **WebSocket reconnect race fixed**: Events from a previous, already replaced socket no longer affect the current connection (no orphaned sockets, correct `isConnected()`, no duplicate reconnects).
- **WebSocket follows token/region changes**: Changing token or region while connected re-establishes the connection with the new settings.
- **Cloud API errors surface**: Responses with a non-zero `code` are raised as typed errors instead of being treated as empty results. Non-JSON responses raise a clear "invalid response" error instead of a misleading network error.
- **Single authorization header**: Requests send exactly one `Authorization` value instead of a merged `"Bearer x, Bearer x"`.
- **CLI `set` uses typed device controls**: `--mode`, `--temp`, `--level`, `--speed`, `--oscillate`, `--child-lock` and `--timer` go through the heater/fan control methods, so the correct protocol keys are sent (e.g. `--mode heat` becomes the device's `hotair` mode). Invalid flag values are rejected with an error instead of silently sending `false`.
- **Heater temperature validation**: Target temperatures outside 5–35 °C (41–95 °F) are rejected before any command is sent, as the `device-control` spec already requires.
- **Devices without serial number** are skipped during discovery instead of overwriting each other under an empty key.
- **Separate CLI entry point** — **BREAKING** for consumers importing CLI helpers from the package root: `runInteractiveMenu` and the session helpers move to the `dreo-client/cli` subpath, so library consumers no longer load `@inquirer/prompts`.
- **Housekeeping**: The device-list endpoint constant matches the path actually used.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `client-core`: Add requirements for surfacing cloud API error codes and invalid responses, sending a single authorization header, ignoring devices without serial number, and releasing all client resources.
- `realtime-monitoring`: Clarify that connections opened implicitly for command delivery are short-lived, that stale socket events never affect the current connection, and that token/region changes reconnect.
- `device-control`: Make the heater temperature range explicit and require rejection of out-of-range values.
- `cli`: CLI device control maps flags onto typed device controls and validates flag values; CLI commands and the interactive menu terminate cleanly (including on Ctrl+C); CLI helpers are exposed through a dedicated entry point.

## Impact

- `src/client.ts`, `src/api/http-service.ts`, `src/api/websocket-client.ts`, `src/devices/dreo-heater.ts`, `src/constants.ts`, `src/errors.ts`
- `src/index.ts` (stops re-exporting CLI modules), new `src/cli/index.ts` entry, `tsup.config.ts` and `package.json` `exports` (new `./cli` subpath)
- `bin/dreo.js` (imports from the CLI entry, routes `set` through device methods, closes the client)
- `src/cli/interactive.ts` (graceful Ctrl+C, closes client on exit)
- Tests in `tests/` for the reconnect race, idle close, API error codes, header, temperature validation and CLI flag mapping
- No new dependencies. Public API additions: `DreoClient.close()`. Public API move: CLI helpers to `dreo-client/cli`.
