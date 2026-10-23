# Tasks

## 1. Project Initialization & Tooling

- [x] 1.1 Initialize `package.json` with Node.js >= 20 engine, dependencies (`ws`, `@types/ws`), dev dependencies (`tsup`, `typescript`, `vitest`), and build scripts; verify configuration.
- [x] 1.2 Setup `tsconfig.json` and `tsup.config.ts` targeting ESM and CommonJS with `.d.ts` generation; verify clean compilation.

## 2. Core REST API & Authentication

- [x] 2.1 Create constants and `DreoHttpService` supporting regional endpoints (`eu` / `us`) using native Node.js `fetch`; verify URL routing and error normalization tests.
- [x] 2.2 Implement authentication (`login`) and device inventory (`getDeviceList`) endpoints with token retention; verify unit tests with simulated Dreo API responses.

## 3. Device Abstraction Hierarchy

- [x] 3.1 Implement base `DreoDevice` class with metadata, state storage, event dispatching, and command execution interface; verify base device unit tests.
- [x] 3.2 Implement `DreoHeater` subclass with typed controls for target temperature, modes (Heat/Eco/Fan), oscillation, child lock, and timer (Atom 316 / DR-HSH); verify heater unit tests.
- [x] 3.3 Implement `DreoFan` subclass with speed, oscillation, and wind mode controls; verify fan unit tests.
- [x] 3.4 Implement device factory function to instantiate `DreoHeater`, `DreoFan`, or `DreoDevice` based on model string; verify factory classification tests.

## 4. Real-time WebSocket Client

- [x] 4.1 Implement `DreoWebSocketClient` wrapping `ws` with access token query params, message parsing, and ping/pong heartbeat keepalives; verify connection lifecycle unit tests.
- [x] 4.2 Implement telemetry event routing to dispatch state updates to matching devices and trigger `deviceUpdate` on the client; verify state dispatch tests.
- [x] 4.3 Implement auto-reconnection with exponential backoff on socket closure; verify reconnection timer tests.

## 5. Main Client Facade & CLI

- [x] 5.1 Implement high-level `DreoClient` class orchestrating `DreoHttpService`, device registry, and optional WebSocket lifecycle (`startMonitoring`, `stopMonitoring`); verify integration test suite.
- [x] 5.2 Implement CLI executable (`bin/dreo`) supporting `login`, `list`, `get`, `set`, and `monitor` commands; verify CLI help and command parsing.
- [x] 5.3 Write README.md with quickstart guide, API reference, and example code; verify complete build and test suite pass (`npm run build && npm test`).

