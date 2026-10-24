# Tasks

## 1. HTTP layer

- [x] 1.1 Add `DreoApiError` (with `code`) to `src/errors.ts` and verify it is exported from the package root
- [x] 1.2 In `DreoHttpService.request()`, parse JSON in a separate `try` and throw `DreoError('Invalid response from Dreo Cloud (HTTP <status>)')` on failure; verify with a test using a `fetchFn` whose `json()` rejects
- [x] 1.3 Add `checkCode` (default `true`) to `request()`, throw `DreoApiError` for numeric `code !== 0`, and pass `false` from `login()`; verify tests for device list with `code: 401xx` rejecting, `code: 0` and missing `code` succeeding, and the existing login fallback tests still passing
- [x] 1.4 Rethrow `DreoApiError` as `DreoCommandError` (same code) in `sendDeviceControl`; verify with a test
- [x] 1.5 Remove the lowercase `authorization` header so only `Authorization` and `ua-authorization` are sent; verify a test asserting `new Headers(init.headers).get('authorization') === 'Bearer <token>'`
- [x] 1.6 Set `DREO_ENDPOINTS.DEVICE_LIST` to `/api/v2/user-device/device/list` and use it in `getDeviceList()`; verify the request URL in an existing or new test

## 2. WebSocket client

- [x] 2.1 Pass the socket instance into `setupSocketListeners` and ignore `open`/`message`/`close`/`pong` events from a socket that is no longer `this.ws` (keep its `error` listener attached but drop its errors); verify with a regression test using a local `WebSocketServer`: connect, `disconnect()` + `connect()`, then assert `isConnected()` is true and the server sees exactly one open client
- [x] 2.2 Add an optional `{ reconnect?: boolean }` argument to `connect()` and a way to enable reconnect on an open connection; verify a test where a connection opened with `reconnect: false` is not re-opened after the server closes it
- [x] 2.3 Make `setToken`/`setRegion` reconnect when the value changes while open or connecting; verify a test that the new socket uses the new token in its URL
- [x] 2.4 `unref()` the heartbeat interval and reconnect timer; verify existing websocket tests still pass

## 3. Client lifecycle

- [x] 3.1 Track explicit monitoring in `DreoClient` and add `commandConnectionIdleMs` (default 5000) to `DreoClientOptions`
- [x] 3.2 In `dispatchDeviceCommand`, open command-scoped connections with `reconnect: false` and (re)arm an unref'd idle timer that disconnects on expiry unless monitoring is active; verify with fake timers that the connection closes after the idle period and that a second command within the window reuses it
- [x] 3.3 Make `startMonitoring()` adopt an open command-scoped connection (cancel idle timer, enable reconnect) and `stopMonitoring()` clear the monitoring flag; verify a test that a command during monitoring does not arm the idle timer
- [x] 3.4 Add `DreoClient.close()` that stops monitoring, cancels the idle timer and disconnects; verify a test that no reconnect or timer remains afterwards
- [x] 3.5 Skip raw devices without `sn`/`deviceSn` in `getDevices()`; verify a test with two SN-less records and one valid device returning exactly one device

## 4. Device control

- [x] 4.1 Validate `DreoHeater.setTargetTemperature` (finite, 5–35 °C or 41–95 °F) and throw `DreoCommandError` before dispatch; verify tests for 22 °C ok, 50 °C rejected without transport call and unchanged state, 70 °F ok

## 5. CLI

- [x] 5.1 Create `src/cli/controls.ts` with `parseControlFlags` and `applyControlPlan` per the design's support matrix; verify unit tests for `--mode heat --level 2` → `setMode(Heat, 2)`, `--oscillate` without value rejected, `--temp abc` rejected, `--speed` on a heater rejected, `--timer` on a fan rejected, and call order
- [x] 5.2 Create `src/cli/index.ts` re-exporting `interactive`, `session`, `controls`; remove CLI exports from `src/index.ts`; add the `cli` entry to `tsup.config.ts` and `"./cli"` to `package.json` `exports`; verify `npm run build` emits `dist/cli.js`/`dist/cli.cjs`/`dist/cli.d.ts` and `node -e "require('./dist/index.cjs')"` does not load `@inquirer/prompts` (check `require.cache`)
- [x] 5.3 Update `bin/dreo.js` to import CLI helpers from `../dist/cli.js`, route `set` through `parseControlFlags`/`applyControlPlan`, and close the client in `finally` for `list`/`get`/`set`; add a `SIGINT` handler for `monitor` that closes the client; verify `dreo --help` runs and `dreo set <sn>` with an invalid flag exits non-zero
- [x] 5.4 In `runInteractiveMenu`, wrap the loop in `try/finally { client.close() }` and treat `ExitPromptError` as a normal exit with a goodbye line; verify a test with a mocked prompt that throws `ExitPromptError` resolves without throwing and calls `client.close()`

## 6. Release

- [x] 6.1 Update README (`dreo-client/cli` import path, `client.close()`, CLI `set` flag rules) and bump `package.json` version to `0.2.0`; verify README examples match the exported names
- [x] 6.2 Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass
- [x] 6.3 Manually run `dreo set <real-sn> --power on` against a real device and verify the device reacts and the process exits within the idle window (or immediately, since the CLI calls `close()`)
