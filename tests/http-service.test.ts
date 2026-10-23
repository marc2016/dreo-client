import { describe, it, expect, vi } from 'vitest';
import { DreoHttpService } from '../src/api/http-service.js';
import { DreoAuthenticationError, DreoNetworkError } from '../src/errors.js';

describe('DreoHttpService', () => {
  it('correctly sets base URL depending on regional configuration', () => {
    const euService = new DreoHttpService({ region: 'eu' });
    expect(euService.getBaseUrl()).toBe('https://app-api-eu.dreo-cloud.com');

    const usService = new DreoHttpService({ region: 'us' });
    expect(usService.getBaseUrl()).toBe('https://app-api-us.dreo-cloud.com');
  });

  it('performs successful login and stores token', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 0,
        data: {
          access_token: 'test_token_123',
          user: { email: 'test@example.com' },
        },
      }),
    });

    const service = new DreoHttpService({ fetchFn: mockFetch as any });
    const auth = await service.login('test@example.com', 'mypassword');

    expect(auth.access_token).toBe('test_token_123');
    expect(service.getToken()).toBe('test_token_123');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe('https://app-api-eu.dreo-cloud.com/api/oauth/login');
  });

  it('throws DreoAuthenticationError on invalid credentials', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 100022,
        msg: 'Incorrect account or password',
      }),
    });

    const service = new DreoHttpService({ fetchFn: mockFetch as any });
    await expect(service.login('test@example.com', 'wrongpassword')).rejects.toThrow(DreoAuthenticationError);
  });

  it('fetches device list using authorization token', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 0,
        data: {
          list: [
            {
              deviceSn: 'DR-HSH006-12345',
              model: 'DR-HSH006',
              deviceName: 'Bedroom Heater',
              reported: { poweron: true, target_temp: 22 },
            },
          ],
        },
      }),
    });

    const service = new DreoHttpService({ token: 'test_token_123', fetchFn: mockFetch as any });
    const devices = await service.getDeviceList();

    expect(devices).toHaveLength(1);
    expect(devices[0].deviceSn).toBe('DR-HSH006-12345');
    expect(devices[0].model).toBe('DR-HSH006');
    expect(mockFetch.mock.calls[0][1].headers['Authorization']).toBe('Bearer test_token_123');
  });

  it('sends device control payload via HTTP', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 0, msg: 'ok' }),
    });

    const service = new DreoHttpService({ token: 'test_token_123', fetchFn: mockFetch as any });
    const result = await service.sendDeviceControl('DR-HSH006-12345', { poweron: false });

    expect(result).toEqual({ code: 0, msg: 'ok' });
    const postBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(postBody.deviceSn).toBe('DR-HSH006-12345');
    expect(postBody.params).toEqual({ poweron: false });
  });

  it('handles network failure and converts to DreoNetworkError', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

    const service = new DreoHttpService({ token: 'test_token_123', fetchFn: mockFetch as any });
    await expect(service.getDeviceList()).rejects.toThrow(DreoNetworkError);
  });
});

