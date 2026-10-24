import { DreoDevice } from '../devices/dreo-device.js';
import { DreoHeater } from '../devices/dreo-heater.js';
import { DreoFan } from '../devices/dreo-fan.js';
import { HeaterMode } from '../types/index.js';

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliUsageError';
  }
}

export interface ControlPlan {
  power?: boolean;
  mode?: HeaterMode;
  level?: 1 | 2 | 3;
  temp?: number;
  speed?: number;
  oscillate?: boolean;
  childLock?: boolean;
  timer?: number;
}

export type ControlFlags = Record<string, string | boolean | undefined>;

const MODES: Record<string, HeaterMode> = {
  heat: HeaterMode.Heat,
  eco: HeaterMode.Eco,
  fan: HeaterMode.Fan,
};

function parseSwitch(flag: string, value: string | boolean): boolean {
  if (value === 'on' || value === 'true') return true;
  if (value === 'off' || value === 'false') return false;
  throw new CliUsageError(`--${flag} expects "on" or "off".`);
}

function parseNumber(flag: string, value: string | boolean, min: number, max: number, integer: boolean): number {
  const num = typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;
  if (!Number.isFinite(num) || (integer && !Number.isInteger(num)) || num < min || num > max) {
    throw new CliUsageError(`--${flag} expects ${integer ? 'an integer' : 'a number'} between ${min} and ${max}.`);
  }
  return num;
}

/** Validates the control flags of `dreo set` and turns them into a typed plan. */
export function parseControlFlags(flags: ControlFlags): ControlPlan {
  const plan: ControlPlan = {};
  const has = (flag: string) => flags[flag] !== undefined;

  if (has('power')) plan.power = parseSwitch('power', flags.power!);
  if (has('mode')) {
    const mode = typeof flags.mode === 'string' ? MODES[flags.mode] : undefined;
    if (!mode) throw new CliUsageError('--mode expects one of: heat, eco, fan.');
    plan.mode = mode;
  }
  if (has('level')) plan.level = parseNumber('level', flags.level!, 1, 3, true) as 1 | 2 | 3;
  if (has('temp')) plan.temp = parseNumber('temp', flags.temp!, 5, 35, false);
  if (has('speed')) plan.speed = parseNumber('speed', flags.speed!, 1, 12, true);
  if (has('oscillate')) plan.oscillate = parseSwitch('oscillate', flags.oscillate!);
  if (has('child-lock')) plan.childLock = parseSwitch('child-lock', flags['child-lock']!);
  if (has('timer')) plan.timer = parseNumber('timer', flags.timer!, 0, 12, true);

  if (plan.level !== undefined && plan.mode !== undefined && plan.mode !== HeaterMode.Heat) {
    throw new CliUsageError('--level can only be combined with --mode heat.');
  }

  return plan;
}

function assertSupported(device: DreoDevice, plan: ControlPlan): void {
  const heaterOnly: (keyof ControlPlan)[] = ['mode', 'level', 'temp', 'childLock', 'timer'];
  const fanOnly: (keyof ControlPlan)[] = ['speed'];
  const flagName: Record<keyof ControlPlan, string> = {
    power: '--power',
    mode: '--mode',
    level: '--level',
    temp: '--temp',
    speed: '--speed',
    oscillate: '--oscillate',
    childLock: '--child-lock',
    timer: '--timer',
  };

  let unsupported: (keyof ControlPlan)[];
  if (device instanceof DreoHeater) {
    unsupported = fanOnly;
  } else if (device instanceof DreoFan) {
    unsupported = heaterOnly;
  } else {
    unsupported = [...heaterOnly, ...fanOnly, 'oscillate'];
  }

  for (const key of unsupported) {
    if (plan[key] !== undefined) {
      throw new CliUsageError(`${flagName[key]} is not supported for ${device.name} (${device.model}).`);
    }
  }
}

/**
 * Applies a control plan through the device's typed controls.
 * Support is checked up front so that no command is sent when any flag is unsupported.
 */
export async function applyControlPlan(device: DreoDevice, plan: ControlPlan): Promise<void> {
  assertSupported(device, plan);

  if (plan.power !== undefined) {
    await device.setPower(plan.power);
  }

  if (device instanceof DreoHeater) {
    if (plan.mode !== undefined) {
      await device.setMode(plan.mode, plan.level);
    } else if (plan.level !== undefined) {
      await device.setHeatLevel(plan.level);
    }
    if (plan.temp !== undefined) {
      await device.setTargetTemperature(plan.temp);
    }
  }

  if (device instanceof DreoFan && plan.speed !== undefined) {
    await device.setSpeed(plan.speed);
  }

  if (plan.oscillate !== undefined && (device instanceof DreoHeater || device instanceof DreoFan)) {
    await device.setOscillation(plan.oscillate);
  }

  if (device instanceof DreoHeater) {
    if (plan.childLock !== undefined) {
      await device.setChildLock(plan.childLock);
    }
    if (plan.timer !== undefined) {
      await device.setTimer(plan.timer);
    }
  }
}
