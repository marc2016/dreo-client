import { DreoDevice, CommandTransportFn } from './dreo-device.js';
import { DreoRawDevice, FanWindType } from '../types/index.js';

export class DreoFan extends DreoDevice {
  constructor(rawDevice: DreoRawDevice, commandTransport: CommandTransportFn) {
    super(rawDevice, commandTransport);
  }

  public async setSpeed(speed: number): Promise<any> {
    const validSpeed = Math.max(1, Math.min(12, speed));
    return this.sendCommands({
      windlevel: validSpeed,
      wind_level: validSpeed,
    });
  }

  public getSpeed(): number {
    return this.state.windlevel ?? this.state.wind_level ?? 1;
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

  public async setVerticalOscillation(oscillate: boolean): Promise<any> {
    return this.sendCommands({
      veroshake: oscillate,
      vertical_oscillation: oscillate,
    });
  }

  public isVerticalOscillating(): boolean {
    return Boolean(this.state.veroshake ?? this.state.vertical_oscillation);
  }

  public async setWindType(type: FanWindType): Promise<any> {
    return this.sendCommands({
      windtype: type,
      wind_type: type,
    });
  }

  public getWindType(): FanWindType | string {
    return this.state.windtype ?? this.state.wind_type ?? FanWindType.Normal;
  }
}

