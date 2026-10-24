import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import WebSocket, { WebSocketServer } from 'ws';
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
    vi.useRealTimers();
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

describe('DreoWebSocketClient against a local server', () => {
  let wss: WebSocketServer;
  let urls: string[];
  let LocalWebSocket: typeof WebSocket;

  beforeEach(async () => {
    wss = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => wss.once('listening', () => resolve()));
    const port = (wss.address() as { port: number }).port;
    urls = [];
    const seen = urls;
    // Redirect every connection to the local server while recording the requested URL
    LocalWebSocket = class extends WebSocket {
      constructor(url: string, options?: WebSocket.ClientOptions) {
        seen.push(url);
        super(`ws://127.0.0.1:${port}`, options);
      }
    } as typeof WebSocket;
  });

  afterEach(async () => {
    for (const c of wss.clients) c.terminate();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
  });

  const waitFor = async (predicate: () => boolean, timeoutMs = 2000) => {
    const start = Date.now();
    while (!predicate()) {
      if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
      await new Promise((r) => setTimeout(r, 10));
    }
  };
  const openServerClients = () => [...wss.clients].filter((c) => c.readyState === WebSocket.OPEN).length;

  it('ignores the late close of a replaced socket after disconnect + connect', async () => {
    const client = new DreoWebSocketClient({ token: 't', WebSocketClass: LocalWebSocket });
    client.on('error', () => {});

    client.connect();
    await new Promise((r) => client.once('open', r));

    client.disconnect();
    client.connect();
    await new Promise((r) => client.once('open', r));
    // Give the old socket time to deliver its close event
    await new Promise((r) => setTimeout(r, 200));

    expect(client.isConnected()).toBe(true);
    expect((client as any).heartbeatTimer).not.toBeNull();
    expect((client as any).reconnectTimer).toBeNull();
    await waitFor(() => openServerClients() === 1);

    client.disconnect();
  });

  it('does not reconnect a connection opened with reconnect: false', async () => {
    const client = new DreoWebSocketClient({ token: 't', reconnectDelayMs: 20, WebSocketClass: LocalWebSocket });
    client.on('error', () => {});

    client.connect({ reconnect: false });
    await new Promise((r) => client.once('open', r));

    for (const c of wss.clients) c.close();
    await waitFor(() => !client.isConnected());
    await new Promise((r) => setTimeout(r, 150));

    expect((client as any).ws).toBeNull();
    expect(urls).toHaveLength(1);
  });

  it('reconnects with the new token when the token changes while connected', async () => {
    const client = new DreoWebSocketClient({ token: 'old_token', WebSocketClass: LocalWebSocket });
    client.on('error', () => {});

    client.connect();
    await new Promise((r) => client.once('open', r));

    client.setToken('new_token');
    await new Promise((r) => client.once('open', r));

    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('accessToken=old_token');
    expect(urls[1]).toContain('accessToken=new_token');
    expect(client.isConnected()).toBe(true);
    await waitFor(() => openServerClients() === 1);

    client.disconnect();
  });

  it('reconnects to the new regional endpoint when the region changes while connected', async () => {
    const client = new DreoWebSocketClient({ token: 't', region: 'eu', WebSocketClass: LocalWebSocket });
    client.on('error', () => {});

    client.connect();
    await new Promise((r) => client.once('open', r));

    client.setRegion('us');
    await new Promise((r) => client.once('open', r));

    expect(urls[0]).toContain('wsb-eu.');
    expect(urls[1]).toContain('wsb-us.');
    client.disconnect();
  });
});
