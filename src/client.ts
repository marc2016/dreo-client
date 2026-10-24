import { EventEmitter } from 'node:events';
import { DreoClientOptions, DreoRegion, DreoAuthResponse } from './types/index.js';
import { DreoHttpService } from './api/http-service.js';
import { DreoWebSocketClient, DreoDeviceUpdateEvent } from './api/websocket-client.js';
import { DreoDevice } from './devices/dreo-device.js';
import { createDevice } from './devices/factory.js';
import { DEFAULT_REGION, DEFAULT_COMMAND_CONNECTION_IDLE_MS } from './constants.js';

export class DreoClient extends EventEmitter {
  public readonly httpService: DreoHttpService;
  public readonly wsClient: DreoWebSocketClient;
  private devices = new Map<string, DreoDevice>();
  private options: DreoClientOptions;
  private monitoringRequested = false;
  private commandIdleTimer: NodeJS.Timeout | null = null;

  constructor(options: DreoClientOptions = {}) {
    super();
    this.options = options;
    const region = options.region ?? DEFAULT_REGION;

    this.httpService = new DreoHttpService({
      region,
      timeoutMs: options.requestTimeoutMs,
      token: options.token,
    });

    this.wsClient = new DreoWebSocketClient({
      region,
      token: options.token,
      heartbeatIntervalMs: options.heartbeatIntervalMs,
      autoReconnect: options.autoReconnect ?? true,
    });

    this.setupWebSocketListeners();
  }

  public getRegion(): DreoRegion {
    return this.httpService.getRegion();
  }

  public setRegion(region: DreoRegion): void {
    this.httpService.setRegion(region);
    this.wsClient.setRegion(region);
  }

  public getToken(): string | null {
    return this.httpService.getToken();
  }

  public setToken(token: string): void {
    this.httpService.setToken(token);
    this.wsClient.setToken(token);
  }

  public async login(email?: string, password?: string): Promise<DreoAuthResponse> {
    const userEmail = email ?? this.options.email;
    const userPass = password ?? this.options.password;

    if (!userEmail || !userPass) {
      throw new Error('Email and password must be provided to login.');
    }

    const auth = await this.httpService.login(userEmail, userPass);
    this.setToken(auth.access_token);
    return auth;
  }

  public async getDevices(refresh = false): Promise<DreoDevice[]> {
    if (this.devices.size > 0 && !refresh) {
      return Array.from(this.devices.values());
    }

    const rawDevices = await this.httpService.getDeviceList();

    for (const raw of rawDevices) {
      const sn = raw.sn || raw.deviceSn;
      if (!sn) {
        // Devices without serial number cannot be addressed by commands or live updates
        continue;
      }
      let device = this.devices.get(sn);
      if (!device) {
        device = createDevice(raw, (params) => this.dispatchDeviceCommand(sn, params));
        this.devices.set(sn, device);
      }

      // If state present on raw, use directly; otherwise fetch from Cloud API
      if (raw.reported || raw.state) {
        device.updateState(raw.reported ?? raw.state ?? {});
      } else {
        try {
          const state = await this.httpService.getDeviceState(sn);
          if (state && Object.keys(state).length > 0) {
            device.updateState(state);
          }
        } catch {
          // ignore
        }
      }
    }

    return Array.from(this.devices.values());
  }

  public getDeviceBySn<T extends DreoDevice = DreoDevice>(sn: string): T | undefined {
    return this.devices.get(sn) as T | undefined;
  }

  public async startMonitoring(): Promise<void> {
    const token = this.getToken();
    if (!token) {
      throw new Error('Cannot start monitoring: not authenticated.');
    }

    if (this.devices.size === 0) {
      await this.getDevices();
    }

    const reconnect = this.options.autoReconnect ?? true;
    this.monitoringRequested = true;
    this.clearCommandIdleTimer();
    // Adopts a connection that was opened for commands instead of opening a second one
    this.wsClient.connect({ reconnect });
    this.wsClient.setReconnectEnabled(reconnect);
    this.emit('monitoringStarted');
  }

  public stopMonitoring(): void {
    this.monitoringRequested = false;
    this.clearCommandIdleTimer();
    this.wsClient.disconnect();
    this.emit('monitoringStopped');
  }

  /** Releases all connections and timers so the host process can exit. */
  public close(): void {
    const wasMonitoring = this.monitoringRequested;
    this.monitoringRequested = false;
    this.clearCommandIdleTimer();
    this.wsClient.disconnect();
    if (wasMonitoring) {
      this.emit('monitoringStopped');
    }
  }

  public isMonitoring(): boolean {
    return this.wsClient.isConnected();
  }

  private async dispatchDeviceCommand(deviceSn: string, params: Record<string, any>): Promise<any> {
    if (this.wsClient.isConnected()) {
      return this.sendOverWebSocket(deviceSn, params);
    }

    // Attempt WebSocket auto-connect if not connected
    const token = this.getToken();
    if (token && this.options.autoReconnect !== false) {
      try {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            cleanup();
            resolve();
          }, 2000);

          const onOpen = () => {
            cleanup();
            resolve();
          };
          const onError = () => {
            cleanup();
            resolve();
          };
          const cleanup = () => {
            clearTimeout(timeout);
            this.wsClient.off('open', onOpen);
            this.wsClient.off('error', onError);
          };

          this.wsClient.once('open', onOpen);
          this.wsClient.once('error', onError);

          try {
            // Connections opened only for commands are short-lived and never reconnect
            this.wsClient.connect({ reconnect: this.monitoringRequested });
          } catch {
            cleanup();
            resolve();
          }
        });
      } catch {
        // fallback to http
      }
    }

    if (this.wsClient.isConnected()) {
      return this.sendOverWebSocket(deviceSn, params);
    }

    if (!this.monitoringRequested) {
      // Drop a connection attempt that did not open in time
      this.wsClient.disconnect();
    }

    // Fallback to HTTP POST control
    return this.httpService.sendDeviceControl(deviceSn, params);
  }

  private async sendOverWebSocket(deviceSn: string, params: Record<string, any>): Promise<void> {
    if (!this.monitoringRequested) {
      this.armCommandIdleTimer();
    }
    return this.wsClient.sendCommand(deviceSn, params);
  }

  private armCommandIdleTimer(): void {
    this.clearCommandIdleTimer();
    const idleMs = this.options.commandConnectionIdleMs ?? DEFAULT_COMMAND_CONNECTION_IDLE_MS;
    this.commandIdleTimer = setTimeout(() => {
      this.commandIdleTimer = null;
      if (!this.monitoringRequested) {
        this.wsClient.disconnect();
      }
    }, idleMs);
    this.commandIdleTimer.unref?.();
  }

  private clearCommandIdleTimer(): void {
    if (this.commandIdleTimer) {
      clearTimeout(this.commandIdleTimer);
      this.commandIdleTimer = null;
    }
  }

  private setupWebSocketListeners(): void {
    this.wsClient.on('deviceUpdate', (event: DreoDeviceUpdateEvent) => {
      const device = this.devices.get(event.deviceSn);
      if (device) {
        const diff = device.updateState(event.reported);
        this.emit('deviceUpdate', device, diff);
      }
    });

    this.wsClient.on('error', (err) => {
      if (this.listenerCount('error') > 0) {
        this.emit('error', err);
      }
    });
  }
}

