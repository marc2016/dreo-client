import { DreoRegion } from './types/index.js';

export const DREO_API_BASE_URLS: Record<DreoRegion, string> = {
  eu: 'https://app-api-eu.dreo-cloud.com',
  us: 'https://app-api-us.dreo-cloud.com',
};

export const DREO_WS_BASE_URLS: Record<DreoRegion, string> = {
  eu: 'wss://wsb-eu.dreo-cloud.com/websocket',
  us: 'wss://wsb-us.dreo-cloud.com/websocket',
};

export const DREO_ENDPOINTS = {
  LOGIN: '/api/oauth/login',
  DEVICE_LIST: '/api/user-device/device/list',
  DEVICE_STATE: '/api/user-device/device/state',
  DEVICE_CONTROL: '/api/user-device/device/control',
};

export const DEFAULT_REGION: DreoRegion = 'eu';
export const DEFAULT_TIMEOUT_MS = 10_000;
export const DEFAULT_HEARTBEAT_MS = 25_000;

