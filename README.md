# dreo-client

Node.js and TypeScript client library for controlling **Dreo** smart home devices (space heaters, tower fans, air circulators, and more).

Inspired by modular clients like [`panasonic-comfort-cloud-client`](https://github.com/marc2016/panasonic-comfort-cloud-client) and designed as a rock-solid foundation for scripts, CLIs, and integrations (e.g. **ioBroker**, **Homebridge**, or **Home Assistant**).

---

## Features

- **Typed & Modern:** Written in TypeScript with dual ESM and CommonJS support (`dist/index.js` and `dist/index.cjs`) including `.d.ts` definitions. CLI helpers live in a separate `dreo-client/cli` entry point, so the library itself does not load any terminal prompt dependencies.
- **Hybrid Device Hierarchy:**
  - `DreoHeater`: Specialized class with thermostat controls, heat/eco/fan modes, oscillation, timer, and child lock (supports **Dreo Atom 316 / DR-HSH series**).
  - `DreoFan`: Specialized class with speed levels, vertical/horizontal oscillation, and wind modes (supports **DR-HTF / DR-HCF / DR-HPF series**).
  - `DreoDevice`: Resilient base class that falls back gracefully on unknown future devices.
- **Optional Real-Time WebSocket:** REST-first for simple scripts; opt-in WebSocket stream for instant push updates and bidirectional control with auto-reconnection and heartbeat keepalive.
- **Zero-Dependency HTTP:** Uses native Node.js `fetch` (requires Node.js >= 20).
- **Multi-Region:** Supports both European (`eu`) and North American / Global (`us`) Dreo cloud clusters.
- **Built-in CLI:** Command-line tool `dreo` for terminal testing, device exploration, and live monitoring.

---

## Installation

```bash
npm install dreo-client
```

*(Requires Node.js >= 20.0.0)*

---

## Quickstart

### 1. Simple REST Usage

```typescript
import { DreoClient, DreoHeater, HeaterMode } from 'dreo-client';

async function main() {
  const client = new DreoClient({
    region: 'eu', // or 'us'
  });

  // Authenticate
  await client.login('your-email@example.com', 'your-password');

  // Discover devices
  const devices = await client.getDevices();
  console.log(`Discovered ${devices.length} devices.`);

  for (const device of devices) {
    console.log(`- ${device.name} (${device.model}) [${device.sn}]`);
  }

  // Find heater (e.g., Dreo Atom 316)
  const heater = devices.find((d) => d instanceof DreoHeater) as DreoHeater;
  if (heater) {
    console.log(`Current Temp: ${heater.getCurrentTemperature()}°C`);
    console.log(`Target Temp: ${heater.getTargetTemperature()}°C`);

    // Turn on, set target temperature to 22°C and enable ECO mode
    await heater.setPower(true);
    await heater.setTargetTemperature(22);
    await heater.setMode(HeaterMode.Eco);
    await heater.setOscillation(true);
  }

  // Release connections so the process can exit right away
  client.close();
}

main().catch(console.error);
```

> Device commands are delivered over WebSocket when possible. If monitoring is not running, the client opens a short-lived connection for them, which closes automatically after `commandConnectionIdleMs` (default 5 s) without further commands. Call `client.close()` to release it immediately.

---

### 2. Real-Time WebSocket Monitoring

```typescript
import { DreoClient } from 'dreo-client';

async function monitor() {
  const client = new DreoClient({ region: 'eu' });
  await client.login('your-email@example.com', 'your-password');

  // Start real-time push stream
  await client.startMonitoring();

  // Listen for changes from any device (physical button press, app, or remote)
  client.on('deviceUpdate', (device, changedAttributes) => {
    console.log(`[Update] ${device.name}:`, changedAttributes);
  });

  // Stop monitoring when shutting down
  process.on('SIGINT', () => {
    client.close();
    process.exit();
  });
}

monitor().catch(console.error);
```

---

## CLI Usage

The package includes a powerful command-line tool `dreo`.

### Interactive Mode (Menu-driven)

Simply run `dreo` in your terminal without any arguments (or `dreo menu`):

```bash
dreo
```

This launches a guided, interactive terminal menu powered by `@inquirer/prompts`:
- 📋 **List & Select Devices:** Browse your devices with real-time status, temperature, and power info.
- ⚙️ **Device Controls:** Interactively toggle power, adjust target temperatures, switch modes (ECO / Heat levels / Fan), toggle oscillation, child lock, and timer.
- 📡 **Live WebSocket Monitor:** Watch incoming telemetry in real-time and return to the menu with `[ENTER]`.
- 🔑 **Account & Login:** Log in, switch between EU and US regions, or renew tokens without manual editing.

---

### Non-Interactive / Scripting Commands

For automation scripts and CI, you can also use direct subcommands:

```bash
# 1. Login and save credentials session (~/.dreo/session.json)
dreo login --user my-account@example.com --password my-secret-pass --region eu

# 2. Inspect session validity and account status
dreo status   # or: dreo whoami

# 3. Log out and clear local credentials
dreo logout

# 4. List all devices
dreo list

# 5. Inspect full state of a device
dreo get <device-sn>

# 6. Control devices
dreo set <device-sn> --power on --temp 21 --mode eco --oscillate on
dreo set <device-sn> --power off

# 7. Live WebSocket monitor
dreo monitor
```

`dreo set` validates all flags before sending anything and applies them through the device's typed controls in a fixed order: `--power`, `--mode`/`--level`, `--temp`, `--speed`, `--oscillate`, `--child-lock`, `--timer`. Switch flags take `on` or `off`. Flags that the device type does not support (for example `--speed` on a heater or `--timer` on a fan) are rejected with a non-zero exit code.

---

## API Reference

### `DreoClient`
- `new DreoClient(options)`: `options` supports `region ('eu' | 'us')`, `email`, `password`, `token`, `requestTimeoutMs`, `heartbeatIntervalMs`, `autoReconnect`, `commandConnectionIdleMs`.
- `login(email, password)`: Authenticates against the Dreo Cloud and acquires an access token.
- `setToken(token)` / `setRegion(region)`: Change token or region; an open WebSocket reconnects with the new settings.
- `getDevices(refresh?: boolean)`: Retrieves list of instantiated device models (`DreoHeater`, `DreoFan`, or `DreoDevice`).
- `getDeviceBySn(sn)`: Lookup device by serial number.
- `startMonitoring()`: Connects persistent WebSocket for live event streaming.
- `stopMonitoring()`: Closes WebSocket and stops reconnect/heartbeat timers.
- `close()`: Releases all connections and timers (monitoring and command connections) so the process can exit.
- Events:
  - `'deviceUpdate'`: `(device: DreoDevice, diff: Record<string, any>) => void`
  - `'error'`: `(err: Error) => void`

### `DreoHeater` (extends `DreoDevice`)
- `setPower(on: boolean)`: Toggle power on/off.
- `setTargetTemperature(temp: number, unit?: 'celsius' | 'fahrenheit')`: Adjust thermostat setpoint (5–35 °C / 41–95 °F; other values reject with `DreoCommandError`).
- `getTargetTemperature()`: Returns setpoint temperature.
- `getCurrentTemperature()`: Returns ambient temperature sensor reading.
- `setMode(mode: HeaterMode, level?: number)`: Set mode (`HeaterMode.Heat`, `HeaterMode.Eco`, `HeaterMode.Fan`).
- `setHeatLevel(level: 1 | 2 | 3)`: Set heat output level.
- `setEcoMode(targetTemp?: number)`: Enable thermostat-regulated Eco mode.
- `setFanOnlyMode()`: Run fan without heating element.
- `setOscillation(oscillate: boolean)`: Toggle horizontal oscillation.
- `setChildLock(locked: boolean)`: Toggle physical button lock.
- `setTimer(hours: number)`: Set shutdown timer (0 to 12 hours).
- `isTippedOver()`: Checks if tip-over safety switch has tripped.

### `DreoFan` (extends `DreoDevice`)
- `setSpeed(speed: number)`: Set fan speed level (1–12).
- `setOscillation(oscillate: boolean)`: Toggle horizontal oscillation.
- `setVerticalOscillation(oscillate: boolean)`: Toggle vertical oscillation (if supported).
- `setWindType(type: FanWindType)`: Set mode (`Normal`, `Natural`, `Sleep`, `Auto`).

### `DreoDevice` (Base Class)
- `sn`: Serial number.
- `model`: Device model identifier.
- `name`: User-assigned device name.
- `state`: Current raw state dictionary.
- `sendCommand(key, value)` / `sendCommands(params)`: Send raw command parameters (transparently routes via active WebSocket or HTTP).
- `on('change', (diff) => ...)`: Event fired when this device's attributes change.

### Errors
All errors extend `DreoError`:
- `DreoAuthenticationError`: Login failed or the cloud answered with HTTP 401/403.
- `DreoApiError`: The cloud answered with a non-zero `code` (e.g. expired token); `code` holds the cloud error code.
- `DreoCommandError`: A device command was rejected by the cloud or failed validation.
- `DreoNetworkError`: Timeout or network failure.

### CLI helpers (`dreo-client/cli`)
```typescript
import { runInteractiveMenu, loadSession, saveSession, parseControlFlags, applyControlPlan } from 'dreo-client/cli';
```
- `runInteractiveMenu({ client, loadSession, saveSession })`: The interactive terminal menu (closes the client when it ends).
- `loadSession` / `saveSession` / `clearSession` / `isSessionExpired` / `formatSessionInfo`: Session file helpers for `~/.dreo/session.json`.
- `parseControlFlags(flags)` / `applyControlPlan(device, plan)`: The validation and mapping used by `dreo set`.

> **Upgrading from 0.1.x:** These helpers were previously exported from `dreo-client` and must now be imported from `dreo-client/cli`.

---

## License

MIT © [Marc Lammers](https://github.com/marc2016)

