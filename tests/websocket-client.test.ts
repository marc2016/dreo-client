import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { DreoWebSocketClient } from '../src/api/websocket-client.js';

class MockWebSocket extends EventEmitter {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  public readyState = MockWebSocket.CONNECTING;
  public send = vi.fn((data: string, cb?: (err?: Error) => void) => {
    if (cb) cb();
  });
  public ping = vi.fn();
  public close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
    this.emit('close', 1000, Buffer.from('Normal Closure'));
  });

  constructor(public url: string, public options?: any) {
    super();
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.emit('open');
    }, 5);
  }
}

describe('DreoWebSocketClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('establishes connection and handles heartbeat', async () => {
    const client = new DreoWebSocketClient({
      region: 'eu',
      token: 'jwt_test_token',
      heartbeatIntervalMs: 10_000,
      WebSocketClass: MockWebSocket as any,
    });

    const openSpy = vi.fn();
    client.on('open', openSpy);

    client.connect();
    expect(client.isConnected()).toBe(false);

    // Fast-forward opening handshake
    await vi.advanceTimersByTimeAsync(10);
    expect(openSpy).toHaveBeenCalled();
    expect(client.isConnected()).toBe(true);

    // Fast-forward heartbeat timer
    await vi.advanceTimersByTimeAsync(10_000);
    // Ping should have been triggered
    client.disconnect();
    expect(client.isConnected()).toBe(false);
  });

  it('parses incoming device status report and emits deviceUpdate', async () => {
    const client = new DreoWebSocketClient({
      token: 'jwt_test_token',
      WebSocketClass: MockWebSocket as any,
    });

    const updateSpy = vi.fn();
    client.on('deviceUpdate', updateSpy);

    client.connect();
    await vi.advanceTimersByTimeAsync(10);

    const wsInstance = (client as any).ws as MockWebSocket;

    // Simulate incoming server push payload
    const payload = {
      method: 'devices-report',
      data: {
        deviceSn: 'DR-HSH006-999',
        reported: { poweron: true, target_temp: 21 },
      },
    };
    wsInstance.emit('message', Buffer.from(JSON.stringify(payload)));

    expect(updateSpy).toHaveBeenCalledWith({
      deviceSn: 'DR-HSH006-999',
      reported: { poweron: true, target_temp: 21 },
    });

    client.disconnect();
  });

  it('sends control commands over WebSocket', async () => {
    const client = new DreoWebSocketClient({
      token: 'jwt_test_token',
      WebSocketClass: MockWebSocket as any,
    });

    client.connect();
    await vi.advanceTimersByTimeAsync(10);

    const wsInstance = (client as any).ws as MockWebSocket;

    await client.sendCommand('DR-HSH006-999', { poweron: false });

    expect(wsInstance.send).toHaveBeenCalledTimes(1);
    const sentData = JSON.parse(wsInstance.send.mock.calls[0][0]);
    expect(sentData.method).toBe('control');
    expect(sentData.deviceSn).toBe('DR-HSH006-999');
    expect(sentData.params).toEqual({ poweron: false });

    client.disconnect();
  });

  it('attempts auto-reconnect on socket disconnect', async () => {
    const client = new DreoWebSocketClient({
      token: 'jwt_test_token',
      autoReconnect: true,
      reconnectDelayMs: 1_000,
      WebSocketClass: MockWebSocket as any,
    });

    client.connect();
    await vi.advanceTimersByTimeAsync(10);
    expect(client.isConnected()).toBe(true);

    const wsInstance = (client as any).ws as MockWebSocket;
    // Simulate drop
    wsInstance.readyState = MockWebSocket.CLOSED;
    wsInstance.emit('close', 1006, Buffer.from('Abnormal Closure'));

    expect(client.isConnected()).toBe(false);

    // Fast-forward reconnect delay
    await vi.advanceTimersByTimeAsync(1_050);
    expect((client as any).ws).not.toBeNull();

    client.disconnect();
  });
});
