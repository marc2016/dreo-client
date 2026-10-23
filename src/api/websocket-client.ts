import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { DreoRegion } from '../types/index.js';
import { DREO_WS_BASE_URLS, DEFAULT_REGION, DEFAULT_HEARTBEAT_MS } from '../constants.js';
import { DreoError } from '../errors.js';

export interface WebSocketClientOptions {
  region?: DreoRegion;
  token?: string;
  heartbeatIntervalMs?: number;
  autoReconnect?: boolean;
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  WebSocketClass?: typeof WebSocket;
}

export interface DreoDeviceUpdateEvent {
  deviceSn: string;
  reported: Record<string, any>;
}

export class DreoWebSocketClient extends EventEmitter {
  private region: DreoRegion;
  private token: string | null = null;
  private heartbeatIntervalMs: number;
  private autoReconnect: boolean;
  private reconnectDelayMs: number;
  private maxReconnectDelayMs: number;
  private currentReconnectDelay: number;
  private WebSocketClass: typeof WebSocket;

  private ws: WebSocket | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private shouldReconnect = false;
  private isConnecting = false;

  constructor(options: WebSocketClientOptions = {}) {
    super();
    this.region = options.region ?? DEFAULT_REGION;
    this.token = options.token ?? null;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_MS;
    this.autoReconnect = options.autoReconnect ?? true;
    this.reconnectDelayMs = options.reconnectDelayMs ?? 2_000;
    this.maxReconnectDelayMs = options.maxReconnectDelayMs ?? 30_000;
    this.currentReconnectDelay = this.reconnectDelayMs;
    this.WebSocketClass = options.WebSocketClass ?? WebSocket;
  }

  public setToken(token: string): void {
    this.token = token;
  }

  public setRegion(region: DreoRegion): void {
    this.region = region;
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public connect(): void {
    if (this.isConnected() || this.isConnecting) {
      return;
    }

    if (!this.token) {
      throw new DreoError('Cannot connect WebSocket: token is missing. Please authenticate first.');
    }

    this.shouldReconnect = this.autoReconnect;
    this.isConnecting = true;

    const baseUrl = DREO_WS_BASE_URLS[this.region] ?? DREO_WS_BASE_URLS.eu;
    const url = `${baseUrl}?accessToken=${encodeURIComponent(this.token)}`;

    try {
      this.ws = new this.WebSocketClass(url, {
        headers: {
          'User-Agent': 'Dreo/2.5.0 (iPhone; iOS 17.5; Scale/3.00)',
        },
      });

      this.setupSocketListeners();
    } catch (err: any) {
      this.isConnecting = false;
      this.emit('error', err);
      this.scheduleReconnect();
    }
  }

  public disconnect(): void {
    this.shouldReconnect = false;
    this.clearTimers();

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.isConnecting = false;
  }

  public async sendCommand(deviceSn: string, params: Record<string, any>): Promise<void> {
    if (!this.isConnected() || !this.ws) {
      throw new DreoError('WebSocket is not connected. Cannot send command over WebSocket.');
    }

    const payload = {
      method: 'control',
      deviceSn,
      params,
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      this.ws!.send(JSON.stringify(payload), (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  private setupSocketListeners(): void {
    if (!this.ws) return;

    this.ws.on('open', () => {
      this.isConnecting = false;
      this.currentReconnectDelay = this.reconnectDelayMs;
      this.startHeartbeat();
      this.emit('open');
    });

    this.ws.on('message', (data: WebSocket.RawData) => {
      this.handleIncomingMessage(data);
    });

    this.ws.on('error', (err: Error) => {
      this.emit('error', err);
    });

    this.ws.on('close', (code: number, reason: Buffer) => {
      this.isConnecting = false;
      this.clearTimers();
      this.ws = null;
      this.emit('close', code, reason.toString());

      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    });

    this.ws.on('pong', () => {
      // Received pong frame from server
    });
  }

  private handleIncomingMessage(rawData: WebSocket.RawData): void {
    try {
      const text = rawData.toString('utf8');
      const json = JSON.parse(text);

      this.emit('message', json);

      // Extract device update reports
      const update = this.parseDeviceUpdate(json);
      if (update) {
        this.emit('deviceUpdate', update);
      }
    } catch {
      // ignore non-json messages (e.g. heartbeat pings)
    }
  }

  private parseDeviceUpdate(msg: any): DreoDeviceUpdateEvent | null {
    if (!msg || typeof msg !== 'object') return null;

    // Pattern 1: { method: 'devices-report', data: { deviceSn, reported } }
    if (msg.data && msg.data.deviceSn && (msg.data.reported || msg.data.state)) {
      return {
        deviceSn: msg.data.deviceSn,
        reported: msg.data.reported ?? msg.data.state,
      };
    }

    // Pattern 2: { deviceSn: '...', reported: { ... } }
    if (msg.deviceSn && (msg.reported || msg.state || msg.params)) {
      return {
        deviceSn: msg.deviceSn,
        reported: msg.reported ?? msg.state ?? msg.params,
      };
    }

    // Pattern 3: { method: 'control-reply', deviceSn: '...', params: { ... } }
    if (msg.method === 'control-reply' && msg.deviceSn && msg.params) {
      return {
        deviceSn: msg.deviceSn,
        reported: msg.params,
      };
    }

    return null;
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected() && this.ws) {
        try {
          if (typeof this.ws.ping === 'function') {
            this.ws.ping();
          } else {
            this.ws.send(JSON.stringify({ method: 'ping' }));
          }
        } catch (err) {
          this.emit('error', err);
        }
      }
    }, this.heartbeatIntervalMs);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    const delay = this.currentReconnectDelay;
    this.currentReconnectDelay = Math.min(this.maxReconnectDelayMs, delay * 1.5);

    this.reconnectTimer = setTimeout(() => {
      if (this.shouldReconnect) {
        this.connect();
      }
    }, delay);
  }

  private clearTimers(): void {
    this.clearHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

