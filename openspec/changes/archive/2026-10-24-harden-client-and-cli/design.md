# Design

## Context

See proposal.md – Why. Relevant current behavior:

- `DreoClient.dispatchDeviceCommand` calls `wsClient.connect()` when no WebSocket is open (unless `autoReconnect === false`), waits up to 2 s, then sends over WebSocket, falling back to HTTP. The connection it opens is identical to a monitoring connection: heartbeat interval, auto-reconnect, never closed.
- Commit `580f1dd` ("fix live device control") introduced WebSocket delivery for commands. It is not verified whether HTTP `POST /device/control` alone reliably reaches devices, so WebSocket delivery must be kept.
- `DreoWebSocketClient` registers `close`/`error`/`open` handlers that always act on `this.ws`, regardless of which socket fired them.
- `DreoHttpService.request` never inspects the `code` field; only `login()` does. Success responses use `code: 0` (see existing tests).
- `bin/dreo.js` is untested plain JS and builds raw parameter maps for `set`.
- `src/index.ts` re-exports `cli/interactive` and `cli/session`, which pulls `@inquirer/prompts` (ESM-only) into both library builds.

## Goals / Non-Goals

**Goals:**
- Keep WebSocket command delivery, but bound the lifetime of connections the client opens on its own.
- Make all CLI paths terminate deterministically.
- Move CLI flag handling into typed, unit-testable TypeScript.

**Non-Goals:**
- Removing the plaintext-password login fallback (needs verification against real accounts first).
- Token refresh / re-login on expiry.
- Mapping individual cloud error codes to specific error classes beyond what is listed below.
- Waiting for device acknowledgements of WebSocket commands.

## Decisions

### 1. Two connection modes: monitoring vs. command-scoped

`DreoClient` tracks whether monitoring was requested explicitly (`startMonitoring()` sets it, `stopMonitoring()`/`close()` clear it).

- When a command needs a connection and monitoring is not active, the client opens the WebSocket **without auto-reconnect** and (re)arms an idle timer (`commandConnectionIdleMs`, default 5 000 ms, new `DreoClientOptions` field). Every further command re-arms it; on expiry the client disconnects.
- `startMonitoring()` while a command-scoped connection is open cancels the idle timer and enables auto-reconnect on the existing connection instead of opening a second one.
- `DreoWebSocketClient.connect()` gets an optional `{ reconnect?: boolean }` argument (default: the instance's `autoReconnect`), so the client can choose per connection.
- The idle timer and the heartbeat interval are `unref()`'d. The open socket itself still keeps the event loop alive, which is why the idle close (library) and `close()` (CLI) are both needed.

*Alternatives considered:*
- **Always use HTTP unless monitoring** – matches the original spec wording most literally, but risks reverting the fix from `580f1dd` without evidence that HTTP control works. Rejected for now.
- **Open–send–close per command** – simplest lifecycle, but every command pays a TLS + WS handshake, and multi-flag CLI calls would reconnect several times. The idle window covers bursts.
- **Only add `close()` and leave cleanup to callers** – leaks connections for every library consumer who never monitors. Rejected; `close()` is added as well, not instead.

### 2. Stale socket guard

`setupSocketListeners(socket)` captures the socket instance; every handler – including `error` – starts with `if (this.ws !== socket) return;`. The `error` listener stays attached to stale sockets so `ws` never throws an unhandled `error`, but their errors are dropped instead of re-emitted, so they cannot disturb a connection attempt that is waiting on the new socket. `disconnect()` keeps clearing `this.ws` before closing, so the late `close` event of the old socket becomes a no-op.

*Alternative:* `removeAllListeners()` on the old socket – rejected because `ws` throws when a socket emits `error` with no listener.

### 3. Token / region change reconnects

`DreoWebSocketClient.setToken`/`setRegion` compare against the current value; if changed and a socket is open or connecting, they call `disconnect()` and then `connect()` with the previous reconnect setting. `DreoClient.setToken/setRegion` already delegate, so no client change is needed beyond that.

### 4. Cloud error codes and invalid bodies in `request()`

- JSON parsing moves into its own `try`; a parse failure throws `DreoError('Invalid response from Dreo Cloud (HTTP <status>)')`.
- After parsing, if the body is an object with a numeric `code !== 0`, `request()` throws a new `DreoApiError(message, code)` (extends `DreoError`). A missing `code` counts as success.
- `request()` gets a `checkCode` flag (default `true`); `login()` passes `false` because it already interprets `100021/100022` for its fallback and raises `DreoAuthenticationError`.
- `sendDeviceControl` catches `DreoApiError` and rethrows it as the existing `DreoCommandError` with the same code, so control failures keep a command-specific type.

### 5. One authorization header

Drop the lowercase `authorization` entry; keep `Authorization: Bearer <token>` and `ua-authorization: <token>` (the latter is what the app sends and was part of the working fix).

### 6. CLI control mapping as a typed module

New `src/cli/controls.ts` exports `parseControlFlags(flags)` (validation, returns a typed plan or throws a `CliUsageError` naming the flag) and `applyControlPlan(device, plan)` which calls device methods in a fixed order: power → mode/level → temperature → speed → oscillation → child lock → timer. Support matrix:

| Flag | Heater | Fan | Generic |
|---|---|---|---|
| `--power on\|off` | `setPower` | `setPower` | `setPower` |
| `--mode heat\|eco\|fan` (+ `--level 1-3`) | `setMode` | – | – |
| `--level 1-3` alone | `setHeatLevel` | – | – |
| `--temp <n>` | `setTargetTemperature` | – | – |
| `--speed 1-12` | – | `setSpeed` | – |
| `--oscillate on\|off` | `setOscillation` | `setOscillation` | – |
| `--child-lock on\|off` | `setChildLock` | – | – |
| `--timer 0-12` | `setTimer` | – | – |

Unsupported flag for the device type → error before anything is sent. `bin/dreo.js` only parses argv, resolves the device and calls these two functions.

*Trade-off:* several flags now produce several sequential commands instead of one combined map. This is the price of reusing the typed methods and their key mapping; with the command-scoped connection they share one socket.

### 7. Heater temperature validation

`setTargetTemperature` validates the input in its own unit (5–35 °C / 41–95 °F, finite number) and throws `DreoCommandError` before dispatching.

### 8. CLI entry point and termination

- New `src/cli/index.ts` re-exports `interactive`, `session` and `controls`; `src/index.ts` drops the CLI exports. `tsup.config.ts` builds both entries (ESM + CJS + d.ts); `package.json` `exports` gains `"./cli"`. `splitting: true` is enabled for CJS as well: without it `dist/cli.cjs` bundles its own copy of the device classes and `instanceof DreoHeater` fails for devices created through `dreo-client` (verified during implementation; ESM already shares a chunk).
- `bin/dreo.js` imports `DreoClient` from `dist/index.js` and CLI helpers from `dist/cli.js`, wraps one-shot commands in `try/finally { client.close() }`, and for `monitor` installs a `SIGINT` handler that closes the client.
- `runInteractiveMenu` wraps its loop in `try/finally { client.close() }` and treats an error named `ExitPromptError` (thrown by `@inquirer/prompts` on Ctrl+C) as a normal exit with a goodbye line.

### 9. Small fixes

- `getDevices()` skips raw devices without `sn`/`deviceSn`.
- `DREO_ENDPOINTS.DEVICE_LIST` becomes `/api/v2/user-device/device/list` and is used by `getDeviceList()`.

## Risks / Trade-offs

- [Cloud returns non-zero `code` for responses that previously "worked" (e.g. state endpoint for an offline device)] → `getDevices()` already wraps `getDeviceState` in a `try/catch`; only the device-list and control calls start failing loudly, which is the intended behavior.
- [Moving CLI exports is breaking for anyone importing `runInteractiveMenu` from the root] → version bump to `0.2.0` and a README note; the package is pre-1.0.
- [Idle close drops a connection a library user relied on implicitly for live updates] → live updates were never specified for implicit connections; such users call `startMonitoring()`.
- [Sequential CLI commands partially apply if a later one fails] → commands run in a fixed, documented order and the CLI reports which flag failed.

## Migration Plan

1. Release as `0.2.0`; README documents `dreo-client/cli` and `client.close()`.
2. No session-file or config migration needed.
3. Rollback: reinstall `0.1.0`; there is no persistent state change.

## Open Questions

- Which non-zero cloud codes mean "token expired"? Once known, they can be mapped to `DreoAuthenticationError` inside `request()` without changing specs or tasks.
