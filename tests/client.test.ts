import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DreoClient } from '../src/client.js';
import { DreoHeater } from '../src/devices/dreo-heater.js';
import { EventEmitter } from 'node:events';

class MockWebSocket extends EventEmitter {
  static OPEN = 1;
  static CLOSED = 3;
  public readyState = MockWebSocket.OPEN;
  public send = vi.fn();
  public ping = vi.fn();
  public close = vi.fn();
}

describe('DreoClient', () => {
  it('manages login, loads devices, and routes commands', async () => {
    const mockFetch = vi.fn();

    // Mock login response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        code: 0,
        data: { access_token: 'auth_token_xyz' },
      }),
    });

    // Mock getDeviceList response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        code: 0,
        data: {
          list: [
            {
              deviceSn: 'DR-HSH006-TEST',
              model: 'DR-HSH006',
              deviceName: 'Bedroom Heater',
              reported: { poweron: false, target_temp: 21 },
            },
          ],
        },
      }),
    });

    // Mock sendDeviceControl response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ code: 0, msg: 'ok' }),
    });

    const client = new DreoClient({
      region: 'eu',
    });
    // Replace internal fetchFn for test
    (client.httpService as any).fetchFn = mockFetch;

    await client.login('user@test.com', 'secret');
    expect(client.getToken()).toBe('auth_token_xyz');

    const devices = await client.getDevices();
    expect(devices).toHaveLength(1);

    const heater = client.getDeviceBySn<DreoHeater>('DR-HSH006-TEST');
    expect(heater).toBeDefined();
    expect(heater).toBeInstanceOf(DreoHeater);
    expect(heater!.getTargetTemperature()).toBe(21);

    // Send command via HTTP fallback
    await heater!.setPower(true);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    const postBody = JSON.parse(mockFetch.mock.calls[2][1].body);
    expect(postBody.deviceSn).toBe('DR-HSH006-TEST');
    expect(postBody.params).toEqual({ poweron: true });
    expect(heater!.isPowerOn()).toBe(true);
  });

  it('updates device state and emits event when WebSocket message arrives', async () => {
    const client = new DreoClient({
      region: 'eu',
      token: 'test_token',
    });

    const heater = new DreoHeater(
      {
        deviceSn: 'HSH-999',
        model: 'DR-HSH006',
        deviceName: 'Heater',
        reported: { poweron: false, target_temp: 20 },
      },
      vi.fn()
    );

    (client as any).devices.set('HSH-999', heater);

    const updateSpy = vi.fn();
    client.on('deviceUpdate', updateSpy);

    // Simulate WebSocket event on internal wsClient
    client.wsClient.emit('deviceUpdate', {
      deviceSn: 'HSH-999',
      reported: { poweron: true, target_temp: 24 },
    });

    expect(updateSpy).toHaveBeenCalledWith(heater, { poweron: true, target_temp: 24 });
    expect(heater.isPowerOn()).toBe(true);
    expect(heater.getTargetTemperature()).toBe(24);
  });
});


class OpeningWebSocket extends EventEmitter {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  static instances: OpeningWebSocket[] = [];

  public readyState = OpeningWebSocket.CONNECTING;
  public send = vi.fn((_data: string, cb?: (err?: Error) => void) => cb?.());
  public ping = vi.fn();
  public close = vi.fn(() => {
    this.readyState = OpeningWebSocket.CLOSED;
    this.emit('close', 1000, Buffer.from(''));
  });

  constructor(public url: string) {
    super();
    OpeningWebSocket.instances.push(this);
    setTimeout(() => {
      this.readyState = OpeningWebSocket.OPEN;
      this.emit('open');
    }, 5);
  }
}

describe('DreoClient connection lifecycle', () => {
  const createClient = (options: Record<string, unknown> = {}) => {
    const client = new DreoClient({ region: 'eu', token: 'test_token', ...options });
    (client.wsClient as any).WebSocketClass = OpeningWebSocket;
    (client as any).devices.set('SN-1', {});
    return client;
  };
  const dispatch = (client: DreoClient, params: Record<string, any>) =>
    (client as any).dispatchDeviceCommand('SN-1', params) as Promise<unknown>;

  beforeEach(() => {
    vi.useFakeTimers();
    OpeningWebSocket.instances = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('closes a connection opened for commands after the idle period and reuses it within the window', async () => {
    const client = createClient({ commandConnectionIdleMs: 5_000 });

    const first = dispatch(client, { poweron: true });
    await vi.advanceTimersByTimeAsync(10);
    await first;
    expect(client.wsClient.isConnected()).toBe(true);

    await vi.advanceTimersByTimeAsync(4_000);
    await dispatch(client, { poweron: false });
    expect(OpeningWebSocket.instances).toHaveLength(1);
    expect(OpeningWebSocket.instances[0].send).toHaveBeenCalledTimes(2);

    // Idle timer was re-armed by the second command
    await vi.advanceTimersByTimeAsync(4_000);
    expect(client.wsClient.isConnected()).toBe(true);

    await vi.advanceTimersByTimeAsync(1_100);
    expect(client.wsClient.isConnected()).toBe(false);

    // No reconnect for command-scoped connections
    await vi.advanceTimersByTimeAsync(60_000);
    expect(OpeningWebSocket.instances).toHaveLength(1);
  });

  it('keeps the connection open for commands while monitoring is active', async () => {
    const client = createClient({ commandConnectionIdleMs: 1_000 });

    await client.startMonitoring();
    await vi.advanceTimersByTimeAsync(10);

    await dispatch(client, { poweron: true });
    expect((client as any).commandIdleTimer).toBeNull();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(client.wsClient.isConnected()).toBe(true);
    client.close();
  });

  it('adopts a command-scoped connection when monitoring starts', async () => {
    const client = createClient({ commandConnectionIdleMs: 1_000 });

    const pending = dispatch(client, { poweron: true });
    await vi.advanceTimersByTimeAsync(10);
    await pending;

    await client.startMonitoring();
    expect(OpeningWebSocket.instances).toHaveLength(1);
    expect((client as any).commandIdleTimer).toBeNull();
    expect((client.wsClient as any).shouldReconnect).toBe(true);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(client.wsClient.isConnected()).toBe(true);
    client.close();
  });

  it('close() releases connections and timers and prevents reconnects', async () => {
    const client = createClient();

    await client.startMonitoring();
    await vi.advanceTimersByTimeAsync(10);
    expect(client.wsClient.isConnected()).toBe(true);

    client.close();
    expect(client.wsClient.isConnected()).toBe(false);
    expect((client.wsClient as any).heartbeatTimer).toBeNull();
    expect((client.wsClient as any).reconnectTimer).toBeNull();
    expect((client as any).commandIdleTimer).toBeNull();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(OpeningWebSocket.instances).toHaveLength(1);
  });
});

describe('DreoClient device discovery', () => {
  it('skips devices without serial number', async () => {
    const client = new DreoClient({ token: 'test_token' });
    (client.httpService as any).fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 0,
        data: {
          list: [
            { model: 'DR-HSH006', deviceName: 'No SN A', reported: { poweron: true } },
            { model: 'DR-HTF001', deviceName: 'No SN B', reported: { poweron: false } },
            { deviceSn: 'SN-OK', model: 'DR-HSH006', deviceName: 'Valid', reported: { poweron: false } },
          ],
        },
      }),
    });

    const devices = await client.getDevices();
    expect(devices).toHaveLength(1);
    expect(devices[0].sn).toBe('SN-OK');
  });
});
