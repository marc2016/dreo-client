# dreo-client

Node.js and TypeScript client library for controlling **Dreo** smart home devices (space heaters, tower fans, air circulators, and more).

Inspired by modular clients like [`panasonic-comfort-cloud-client`](https://github.com/marc2016/panasonic-comfort-cloud-client) and designed as a rock-solid foundation for scripts, CLIs, and integrations (e.g. **ioBroker**, **Homebridge**, or **Home Assistant**).

---

## Features

- **Typed & Modern:** Written in TypeScript with dual ESM and CommonJS support (`dist/index.js` and `dist/index.cjs`) including `.d.ts` definitions.
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
}

main().catch(console.error);
```

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
    client.stopMonitoring();
    process.exit();
  });
}

monitor().catch(console.error);
```

---

## CLI Usage

The package includes a command-line tool `dreo`:

```bash
# 1. Login and save credentials session (~/.dreo/session.json)
dreo login --user my-account@example.com --password my-secret-pass --region eu

# 2. List all devices
dreo list

# 3. Inspect full state of a device
dreo get <device-sn>

# 4. Control devices
dreo set <device-sn> --power on --temp 21 --mode eco --oscillate on
dreo set <device-sn> --power off

# 5. Live WebSocket monitor
dreo monitor
```

---

## API Reference

### `DreoClient`
- `new DreoClient(options)`: `options` supports `region ('eu' | 'us')`, `email`, `password`, `token`, `requestTimeoutMs`, `heartbeatIntervalMs`.
- `login(email, password)`: Authenticates against the Dreo Cloud and acquires an access token.
- `setToken(token)`: Sets an existing bearer token directly.
- `getDevices(refresh?: boolean)`: Retrieves list of instantiated device models (`DreoHeater`, `DreoFan`, or `DreoDevice`).
- `getDeviceBySn(sn)`: Lookup device by serial number.
- `startMonitoring()`: Connects persistent WebSocket for live event streaming.
- `stopMonitoring()`: Closes WebSocket and stops reconnect/heartbeat timers.
- Events:
  - `'deviceUpdate'`: `(device: DreoDevice, diff: Record<string, any>) => void`
  - `'error'`: `(err: Error) => void`

### `DreoHeater` (extends `DreoDevice`)
- `setPower(on: boolean)`: Toggle power on/off.
- `setTargetTemperature(temp: number, unit?: 'celsius' | 'fahrenheit')`: Adjust thermostat setpoint.
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

---

## License

MIT © [Marc Lammers](https://github.com/marc2016)

