import { DreoDevice, CommandTransportFn } from './dreo-device.js';
import { DreoRawDevice, HeaterMode, TemperatureUnit } from '../types/index.js';

export class DreoHeater extends DreoDevice {
  constructor(rawDevice: DreoRawDevice, commandTransport: CommandTransportFn) {
    super(rawDevice, commandTransport);
  }

  public async setTargetTemperature(temperature: number, unit: TemperatureUnit = 'celsius'): Promise<any> {
    const payload: Record<string, any> = {
      target_temp: temperature,
      templevel: temperature,
    };
    if (unit === 'fahrenheit') {
      payload.temp_unit = 'fahrenheit';
    } else {
      payload.temp_unit = 'celsius';
    }
    return this.sendCommands(payload);
  }

  public getTargetTemperature(): number | undefined {
    return this.state.target_temp ?? this.state.templevel;
  }

  public getCurrentTemperature(): number | undefined {
    return this.state.cur_temp ?? this.state.temperature;
  }

  public async setMode(mode: HeaterMode, heatLevel: number = 3): Promise<any> {
    const payload: Record<string, any> = {};

    switch (mode) {
      case HeaterMode.Eco:
        payload.mode = 'eco';
        payload.mode_level = 4;
        break;
      case HeaterMode.Fan:
        payload.mode = 'fan';
        payload.mode_level = 0;
        break;
      case HeaterMode.Heat:
      default:
        payload.mode = 'heat';
        payload.mode_level = Math.max(1, Math.min(3, heatLevel));
        payload.heat_level = payload.mode_level;
        break;
    }

    return this.sendCommands(payload);
  }

  public async setHeatLevel(level: 1 | 2 | 3): Promise<any> {
    return this.setMode(HeaterMode.Heat, level);
  }

  public async setEcoMode(targetTemp?: number): Promise<any> {
    if (targetTemp !== undefined) {
      await this.setTargetTemperature(targetTemp);
    }
    return this.setMode(HeaterMode.Eco);
  }

  public async setFanOnlyMode(): Promise<any> {
    return this.setMode(HeaterMode.Fan);
  }

  public getMode(): HeaterMode | string {
    const mode = this.state.mode;
    if (mode === 'eco' || this.state.mode_level === 4) return HeaterMode.Eco;
    if (mode === 'fan' || this.state.mode_level === 0) return HeaterMode.Fan;
    return HeaterMode.Heat;
  }

  public getHeatLevel(): number {
    return this.state.heat_level ?? this.state.mode_level ?? 1;
  }

  public async setOscillation(oscillate: boolean): Promise<any> {
    return this.sendCommands({
      horoshake: oscillate,
      oscillation: oscillate,
    });
  }

  public isOscillating(): boolean {
    return Boolean(this.state.horoshake ?? this.state.oscillation);
  }

  public async setChildLock(locked: boolean): Promise<any> {
    return this.sendCommands({
      child_lock: locked,
      childlock: locked,
    });
  }

  public isChildLocked(): boolean {
    return Boolean(this.state.child_lock ?? this.state.childlock);
  }

  public async setTimer(hours: number): Promise<any> {
    const validHours = Math.max(0, Math.min(12, hours));
    return this.sendCommands({
      timer: validHours,
      off_timer: validHours,
    });
  }

  public getTimer(): number {
    return this.state.timer ?? this.state.off_timer ?? 0;
  }

  public isTippedOver(): boolean {
    return Boolean(this.state.tip_over || this.state.dump_switch);
  }
}

