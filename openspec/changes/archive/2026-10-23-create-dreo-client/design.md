# Design

## Context

See `proposal.md` for motivation. The project is a greenfield Node.js library (`dreo-client`) targeting modern Node.js runtimes (>= 20) with TypeScript. It models Dreo smart devices and manages communication over both HTTPS REST (authentication, device enumeration) and optional WebSockets (push notifications, real-time control).

## Goals / Non-Goals

**Goals:**
- Provide a clean, developer-friendly TypeScript library with both ESM and CommonJS exports.
- Use zero external dependencies for HTTP communication by leveraging native Node.js `fetch`.
- Implement a hybrid device hierarchy (`DreoDevice` base class + specialized subclasses like `DreoHeater`, `DreoFan`).
- Support Dreo heaters out of the box, specifically the Dreo Atom 316 (DR-HSH series / DR-HSH006) and fans.
- Provide an optional, resilient WebSocket client for real-time telemetry and state synchronization.
- Include a lightweight CLI (`bin/dreo`) for rapid debugging, listing devices, and testing controls.

**Non-Goals:**
- Supporting legacy Node.js versions (< 20).
- Building an ioBroker adapter or Homebridge plugin directly inside this repository (this library is the underlying client for those).
- Local-network-only BLE/mDNS communication (Dreo appliances utilize proprietary cloud-based endpoints).

## Decisions

### 1. Zero-dependency HTTP Layer using Native `fetch`
- **Choice:** Use Node.js built-in `fetch` and `AbortController`.
- **Alternatives Considered:** `axios`, `got`, `node-fetch`.
- **Rationale:** Node.js >= 20 includes full, stable Web standard `fetch`. Eliminating third-party HTTP clients reduces bundle size, eliminates transitive vulnerabilities, and speeds up installation.

### 2. Dedicated `ws` Library for WebSocket Transport
- **Choice:** Use `ws` package for WebSocket connection handling.
- **Alternatives Considered:** Experimental native Node.js `WebSocket` API, `reconnecting-websocket`.
- **Rationale:** `ws` is battle-tested, handles custom headers and fine-grained ping/pong frame monitoring reliably, and avoids instability in newer experimental runtimes. Reconnection and exponential backoff are implemented in a lightweight wrapper around `ws`.

### 3. Hybrid Device Abstraction Pattern
- **Choice:** `DreoDevice` as base class, with specialized subclasses (`DreoHeater`, `DreoFan`) instantiated via a factory based on the device model string.
- **Alternatives Considered:**
  1. Pure generic key-value dictionary without typed subclasses.
  2. Strict model-specific classes only (breaking or failing on new/unknown models).
- **Rationale:** Combines top-tier developer ergonomics and autocompletion for known devices (e.g. `heater.setTargetTemperature(22)`, `heater.setMode(HeaterMode.Eco)`) with 100% resilience against unmapped future hardware.

### 4. Optional WebSocket Lifecycle
- **Choice:** REST calls are standalone and do not require WebSocket. Real-time WebSocket streaming is opt-in via `client.startMonitoring()` and `client.stopMonitoring()`.
- **Alternatives Considered:** Always-on WebSocket opened upon login.
- **Rationale:** CLI commands, one-shot automation scripts, and serverless invocations should not hang waiting for a WebSocket connection to close. Long-running integrations (ioBroker, Homebridge) can explicitly start the stream.

### 5. Multi-Region API Strategy
- **Choice:** Default to `eu` region, configurable to `us`, routing to respective subdomains:
  - EU: `https://app-api-eu.dreo-cloud.com` & `wss://wsb-eu.dreo-cloud.com`
  - US: `https://app-api.dreo-cloud.com` & `wss://wsb-us.dreo-cloud.com`
- **Rationale:** Matches Dreo's multi-region cloud deployment.

### 6. Build Tooling with `tsup`
- **Choice:** `tsup` for compilation to `dist/index.mjs`, `dist/index.js`, and TypeScript declaration files (`dist/index.d.ts`).
- **Alternatives Considered:** Raw `tsc` or `rollup`.
- **Rationale:** `tsup` is extremely fast (esbuild-based), produces clean dual-module outputs with zero boilerplate, and automatically bundles typings.

## Risks / Trade-offs

- **[Risk] Cloud API Changes or Rate Limits** → Dreo's cloud API is reverse-engineered and subject to backend changes.  
  *Mitigation:* Keep API endpoints and payload mappings isolated in `src/constants.ts` and `src/api/` for straightforward patching. Include debug logging hooks (`debug` or custom logger callback).
- **[Risk] Heater 24-hour Remote Safety Timeout (UL Compliance)** → Dreo space heaters may disable remote Wi-Fi commands if left untouched for 24 hours until physically interacted with.  
  *Mitigation:* Surface clear error messages when the device rejects commands due to safety timeouts.
- **[Risk] Silent WebSocket Drops (Half-Open Sockets)** → Cloud firewalls or routers may silently terminate idle TCP streams without sending a FIN/RST packet.  
  *Mitigation:* Active heartbeat management sending periodic application-level ping/pong frames every 30 seconds with a 10-second timeout trigger for reconnects.

