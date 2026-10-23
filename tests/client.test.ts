import { describe, it, expect, vi } from 'vitest';
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

