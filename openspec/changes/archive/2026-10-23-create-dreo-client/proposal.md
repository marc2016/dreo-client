# Proposal

## Why

Smart home users and developers integrating Dreo devices into platforms like ioBroker, Homebridge, or custom Node.js automation scripts lack a modern, typed, standalone Node.js client library. While Python (`hass-dreo`) and Homebridge (`homebridge-dreo`) implementations exist, there is no reusable, dual-target (ESM/CJS) Node.js library following the modular architecture of proven clients like `panasonic-comfort-cloud-client`. Creating this library fills this gap, starting with robust support for modern Node.js versions (>= 20) and native support for Dreo heaters (such as the Dreo Atom 316 / DR-HSH series) and fans.

## What Changes

- Initialize project structure targeting Node.js >= 20 with TypeScript and `tsup` dual-build (ESM and CommonJS).
- Implement Dreo Cloud authentication and REST service for regional endpoints (EU and US/global) using native `fetch`.
- Implement device discovery and state retrieval from the Dreo cloud.
- Implement an extensible hybrid device model hierarchy:
  - `DreoDevice`: Base class managing device metadata (`sn`, `model`, `name`), raw state, and generic command dispatch.
  - `DreoHeater`: Specialized class with typed methods for space heaters (e.g., Atom 316 / DR-HSH series), supporting target temperature, heat/eco/fan modes, oscillation, child lock, and timer.
  - `DreoFan`: Specialized class for fans with speed, oscillation, and wind mode controls.
- Implement optional real-time monitoring via WebSocket (`ws`), allowing users to opt into live push event streaming with automatic heartbeat and reconnection management.
- Provide a command-line interface (`bin/dreo`) for credential testing, device listing, manual control, and live event observation.

## Capabilities

### New Capabilities
- `client-core`: Cloud authentication, token persistence, regional API routing (EU/US), and device inventory querying via HTTP REST.
- `device-control`: Device model hierarchy, parameter mapping, command execution, and typed control abstractions for heaters and fans.
- `realtime-monitoring`: Optional WebSocket client with reconnection logic, event dispatching, and command acknowledgments.
- `cli`: Executable CLI tool for authentication, device exploration, parameter adjustment, and live stream inspection.

### Modified Capabilities
<!-- None: Greenfield project -->

## Impact

- New standalone npm package `dreo-client`.
- Dependencies: `ws` (and its dev types), `commander` / minimalist CLI parser for the CLI binary, `tsup`, `typescript`, `vitest` (or node test runner). No external HTTP libraries required (uses Node 20+ native `fetch`).
- Engines: Node.js >= 20.0.0.

