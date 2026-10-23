export type DreoRegion = 'eu' | 'us';

export interface DreoClientOptions {
  region?: DreoRegion;
  email?: string;
  password?: string;
  token?: string;
  autoReconnect?: boolean;
  heartbeatIntervalMs?: number;
  requestTimeoutMs?: number;
}

export interface DreoUser {
  id?: string;
  email?: string;
  nickname?: string;
  region?: string;
}

export interface DreoAuthResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  user?: DreoUser;
}

export interface DreoRawDevice {
  deviceSn: string;
  model: string;
  deviceName: string;
  brand?: string;
  roomId?: string;
  roomName?: string;
  reported?: Record<string, any>;
  state?: Record<string, any>;
  controlsConf?: Record<string, any>;
  online?: boolean;
  connected?: boolean;
}

export type DreoDeviceState = Record<string, any>;

export enum HeaterMode {
  Heat = 'heat',
  Eco = 'eco',
  Fan = 'fan',
}

export enum FanWindType {
  Normal = 'normal',
  Natural = 'natural',
  Sleep = 'sleep',
  Auto = 'auto',
}

export type TemperatureUnit = 'celsius' | 'fahrenheit';

