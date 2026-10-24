#!/usr/bin/env node

import { DreoClient } from '../dist/index.js';
import {
  runInteractiveMenu,
  loadSession,
  saveSession,
  clearSession,
  isSessionExpired,
  formatSessionInfo,
  parseControlFlags,
  applyControlPlan,
  CliUsageError,
} from '../dist/cli.js';

function printHelp() {
  console.log(`
Dreo CLI - Control Dreo Smart Devices

Usage:
  dreo                       Launch interactive terminal menu (default in TTY)
  dreo menu                  Launch interactive terminal menu
  dreo login --user <email> --password <password> [--region <eu|us>]
  dreo status / dreo whoami  Display current session and account status
  dreo logout                Clear local session credentials
  dreo list
  dreo get <device-sn>
  dreo set <device-sn> [options]
  dreo monitor

Commands:
  menu      Launch interactive prompt menu (default when run with no arguments)
  login     Authenticate and store session token
  status    Show active session and authentication status
  whoami    Alias for 'status'
  logout    Log out and remove local credentials
  list      List all devices registered to your account
  get       Display full state for a specific device
  set       Control a device
  monitor   Open real-time WebSocket stream to watch telemetry

Options for 'set':
  --power <on|off>          Turn device on or off
  --temp <5-35>             Set target temperature in °C (heaters)
  --mode <heat|eco|fan>     Set mode (heaters)
  --level <1|2|3>           Set heat level (heaters; with --mode only for heat)
  --speed <1-12>            Set fan speed (fans)
  --oscillate <on|off>      Toggle oscillation (heaters, fans)
  --child-lock <on|off>     Toggle child lock (heaters)
  --timer <0-12>            Set shutdown timer in hours (heaters)

  Flags are applied in this order: power, mode/level, temp, speed,
  oscillate, child-lock, timer.

General Options:
  -h, --help                Show this help message
`);
}

function parseArgs(args) {
  const parsed = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        parsed[key] = next;
        i++;
      } else {
        parsed[key] = true;
      }
    } else {
      parsed._.push(arg);
    }
  }
  return parsed;
}

async function getClient() {
  const session = loadSession();
  if (!session || !session.token) {
    console.error('Error: Not authenticated. Please run "dreo login --user <email> --password <password>" or "dreo menu" first.');
    process.exit(1);
  }

  if (isSessionExpired(session)) {
    console.error('Error: Session has expired. Please run "dreo login" or "dreo menu" to re-authenticate.');
    process.exit(1);
  }

  return new DreoClient({
    region: session.region || 'eu',
    token: session.token,
  });
}

async function main() {
  const args = process.argv.slice(2);

  // If no arguments provided or explicitly requested menu
  if (args.length === 0 || args[0] === 'menu' || args[0] === 'interactive') {
    if (process.stdin.isTTY) {
      const session = loadSession();
      const client = new DreoClient({
        region: session?.region || 'eu',
        token: session?.token,
      });

      await runInteractiveMenu({
        client,
        loadSession,
        saveSession,
      });
      return;
    } else if (args.length === 0) {
      printHelp();
      return;
    }
  }

  if (args.includes('-h') || args.includes('--help')) {
    printHelp();
    return;
  }

  const parsed = parseArgs(args);
  const command = parsed._[0];

  switch (command) {
    case 'status':
    case 'whoami': {
      const session = loadSession();
      console.log('\n--- Dreo Session Status ---');
      console.log(formatSessionInfo(session));
      break;
    }

    case 'logout': {
      if (clearSession()) {
        console.log('Successfully logged out. Session file ~/.dreo/session.json removed.');
      } else {
        console.log('No active session found. You are already logged out.');
      }
      break;
    }

    case 'login': {
      const email = parsed.user || parsed.email;
      const password = parsed.password || parsed.pass;
      const region = parsed.region || 'eu';

      if (!email || !password) {
        console.error('Error: --user and --password are required.');
        process.exit(1);
      }

      console.log(`Logging in to Dreo Cloud (${region.toUpperCase()})...`);
      const client = new DreoClient({ region });
      try {
        const auth = await client.login(email, password);
        const expiresAt = auth.expires_in
          ? new Date(Date.now() + auth.expires_in * 1000).toISOString()
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        saveSession({
          token: auth.access_token,
          region,
          email,
          createdAt: new Date().toISOString(),
          expiresAt,
        });
        console.log('Login successful! Session saved to ~/.dreo/session.json');
      } catch (err) {
        console.error('Login failed:', err.message);
        process.exit(1);
      }
      break;
    }

    case 'list': {
      const client = await getClient();
      console.log('Fetching devices from Dreo Cloud...');
      try {
        const devices = await client.getDevices();
        if (devices.length === 0) {
          console.log('No devices found.');
          return;
        }

        console.log('\nDiscovered Devices:');
        console.table(
          devices.map((d) => ({
            Name: d.name,
            Model: d.model,
            SN: d.sn,
            Power: d.isPowerOn() ? 'ON' : 'OFF',
            State: JSON.stringify(d.state),
          }))
        );
      } catch (err) {
        console.error('Failed to list devices:', err.message);
        process.exitCode = 1;
      } finally {
        client.close();
      }
      break;
    }

    case 'get': {
      const sn = parsed._[1];
      if (!sn) {
        console.error('Error: Device SN is required. Usage: dreo get <device-sn>');
        process.exit(1);
      }

      const client = await getClient();
      try {
        await client.getDevices();
        const device = client.getDeviceBySn(sn);
        if (!device) {
          console.error(`Device with SN ${sn} not found.`);
          process.exitCode = 1;
          break;
        }

        console.log(`Device: ${device.name} (${device.model})`);
        console.log('Current State:');
        console.log(JSON.stringify(device.state, null, 2));
      } finally {
        client.close();
      }
      break;
    }

    case 'set': {
      const sn = parsed._[1];
      if (!sn) {
        console.error('Error: Device SN is required. Usage: dreo set <device-sn> [options]');
        process.exit(1);
      }

      let plan;
      try {
        plan = parseControlFlags(parsed);
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }

      if (Object.keys(plan).length === 0) {
        console.log('No control parameters specified. Run with -h for help.');
        return;
      }

      const client = await getClient();
      try {
        await client.getDevices();
        const device = client.getDeviceBySn(sn);
        if (!device) {
          console.error(`Device with SN ${sn} not found.`);
          process.exitCode = 1;
          break;
        }

        console.log(`Sending commands to ${device.name} (${sn}):`, plan);
        await applyControlPlan(device, plan);
        console.log('Success! Device updated.');
      } catch (err) {
        const prefix = err instanceof CliUsageError ? 'Error:' : 'Failed to update device:';
        console.error(prefix, err.message);
        process.exitCode = 1;
      } finally {
        client.close();
      }
      break;
    }

    case 'monitor': {
      const client = await getClient();
      console.log('Connecting to Dreo WebSocket stream (press Ctrl+C to exit)...');
      process.once('SIGINT', () => {
        client.close();
        console.log('\nMonitor stopped.');
        process.exit(0);
      });
      await client.startMonitoring();

      client.on('deviceUpdate', (device, diff) => {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] Update from ${device.name} (${device.sn}):`, diff);
      });

      client.on('error', (err) => {
        console.error('WebSocket Error:', err.message);
      });
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
