import { DreoRegion } from './types/index.js';

export const DREO_API_BASE_URLS: Record<DreoRegion, string> = {
  eu: 'https://app-api-eu.dreo-tech.com',
  us: 'https://app-api-us.dreo-tech.com',
};

export const DREO_WS_BASE_URLS: Record<DreoRegion, string> = {
  eu: 'wss://wsb-eu.dreo-tech.com/websocket',
  us: 'wss://wsb-us.dreo-tech.com/websocket',
};

export const DREO_CLIENT_CONFIG = {
  CLIENT_ID: '7de37c362ee54dcf9c4561812309347a',
  CLIENT_SECRET: '32dfa0764f25451d99f94e1693498791',
  HIMEI: 'faede31549d649f58864093158787ec9',
  UA: 'dreo/2.8.2',
  USER_AGENT: 'okhttp/4.9.1',
};

export const DREO_ENDPOINTS = {
  LOGIN: '/api/oauth/login',
  DEVICE_LIST: '/api/v2/user-device/device/list',
  DEVICE_STATE: '/api/user-device/device/state',
  DEVICE_CONTROL: '/api/user-device/device/control',
};

export const DEFAULT_REGION: DreoRegion = 'eu';
export const DEFAULT_TIMEOUT_MS = 10_000;
export const DEFAULT_HEARTBEAT_MS = 25_000;
export const DEFAULT_COMMAND_CONNECTION_IDLE_MS = 5_000;

