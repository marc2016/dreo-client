import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { DreoRegion } from '../types/index.js';
import { DREO_WS_BASE_URLS, DEFAULT_REGION, DEFAULT_HEARTBEAT_MS, DREO_CLIENT_CONFIG } from '../constants.js';
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
    if (token === this.token) return;
    this.token = token;
    this.restartIfActive();
  }

  public setRegion(region: DreoRegion): void {
    if (region === this.region) return;
    this.region = region;
    this.restartIfActive();
  }

  /** Enables or disables automatic reconnects for the current connection. */
  public setReconnectEnabled(enabled: boolean): void {
    this.shouldReconnect = enabled;
    if (!enabled && this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public connect(options: { reconnect?: boolean } = {}): void {
    if (this.isConnected() || this.isConnecting) {
      return;
    }

    if (!this.token) {
      throw new DreoError('Cannot connect WebSocket: token is missing. Please authenticate first.');
    }

    this.shouldReconnect = options.reconnect ?? this.autoReconnect;
    this.isConnecting = true;

    const baseUrl = DREO_WS_BASE_URLS[this.region] ?? DREO_WS_BASE_URLS.eu;
    const timestamp = Date.now();
    const url = `${baseUrl}?accessToken=${encodeURIComponent(this.token)}&timestamp=${timestamp}`;

    try {
      const socket = new this.WebSocketClass(url, {
        headers: {
          'User-Agent': DREO_CLIENT_CONFIG.USER_AGENT,
          ua: DREO_CLIENT_CONFIG.UA,
        },
      });
      this.ws = socket;

      this.setupSocketListeners(socket);
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
      // Detach first so the late close event of this socket is ignored
      const socket = this.ws;
      this.ws = null;
      try {
        socket.close();
      } catch {
        // ignore
      }
    }
    this.isConnecting = false;
  }

  public async sendCommand(deviceSn: string, params: Record<string, any>): Promise<void> {
    if (!this.isConnected() || !this.ws) {
      throw new DreoError('WebSocket is not connected. Cannot send command over WebSocket.');
    }

    const payload = {
      devicesn: deviceSn,
      deviceSn,
      method: 'control',
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

  private restartIfActive(): void {
    if (!this.ws) return;
    const reconnect = this.shouldReconnect;
    this.disconnect();
    this.connect({ reconnect });
  }

  private setupSocketListeners(socket: WebSocket): void {
    // Events from a socket that has been replaced or detached must not touch the current connection
    const isCurrent = () => this.ws === socket;

    socket.on('open', () => {
      if (!isCurrent()) return;
      this.isConnecting = false;
      this.currentReconnectDelay = this.reconnectDelayMs;
      this.startHeartbeat();
      this.emit('open');
    });

    socket.on('message', (data: WebSocket.RawData) => {
      if (!isCurrent()) return;
      this.handleIncomingMessage(data);
    });

    // Listener stays attached for stale sockets too, otherwise ws throws on unhandled errors
    socket.on('error', (err: Error) => {
      if (!isCurrent()) return;
      this.emit('error', err);
    });

    socket.on('close', (code: number, reason: Buffer) => {
      if (!isCurrent()) return;
      this.isConnecting = false;
      this.clearTimers();
      this.ws = null;
      this.emit('close', code, reason.toString());

      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    });

    socket.on('pong', () => {
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

    const sn = msg.devicesn ?? msg.deviceSn ?? (msg.data && (msg.data.devicesn ?? msg.data.deviceSn));
    const reported = msg.reported ?? msg.params ?? msg.state ?? (msg.data && (msg.data.reported ?? msg.data.state));

    if (sn && reported) {
      return {
        deviceSn: sn,
        reported,
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
    this.heartbeatTimer.unref?.();
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
    this.reconnectTimer.unref?.();
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

