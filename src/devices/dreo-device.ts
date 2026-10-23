import { EventEmitter } from 'node:events';
import { DreoRawDevice, DreoDeviceState } from '../types/index.js';

export type CommandTransportFn = (params: Record<string, any>) => Promise<any>;

export class DreoDevice extends EventEmitter {
  public readonly sn: string;
  public readonly model: string;
  public name: string;
  public online: boolean;
  public state: DreoDeviceState = {};
  public rawDevice: DreoRawDevice;
  protected commandTransport: CommandTransportFn;

  constructor(rawDevice: DreoRawDevice, commandTransport: CommandTransportFn) {
    super();
    this.rawDevice = rawDevice;
    this.sn = rawDevice.deviceSn;
    this.model = rawDevice.model;
    this.name = rawDevice.deviceName;
    this.online = rawDevice.online ?? rawDevice.connected ?? true;
    this.commandTransport = commandTransport;

    if (rawDevice.reported) {
      this.state = { ...rawDevice.reported };
    } else if (rawDevice.state) {
      this.state = { ...rawDevice.state };
    }
  }

  public updateState(reported: Record<string, any>): Record<string, any> {
    const diff: Record<string, any> = {};

    for (const [key, value] of Object.entries(reported)) {
      if (this.state[key] !== value) {
        diff[key] = value;
        this.state[key] = value;
      }
    }

    if (Object.keys(diff).length > 0) {
      this.emit('change', diff);
      this.emit('stateChange', this.state);
    }

    return diff;
  }

  public async sendCommand(key: string, value: any): Promise<any> {
    return this.sendCommands({ [key]: value });
  }

  public async sendCommands(params: Record<string, any>): Promise<any> {
    const result = await this.commandTransport(params);
    this.updateState(params);
    return result;
  }

  public async setPower(on: boolean): Promise<any> {
    return this.sendCommands({ poweron: on });
  }

  public isPowerOn(): boolean {
    return Boolean(this.state.poweron ?? this.state.power);
  }

  public getState<T = any>(key: string, defaultValue?: T): T | undefined {
    return this.state[key] !== undefined ? (this.state[key] as T) : defaultValue;
  }
}

