import { describe, it, expect, vi } from 'vitest';
import { DreoHttpService } from '../src/api/http-service.js';
import { DreoAuthenticationError, DreoNetworkError, DreoApiError, DreoCommandError, DreoError } from '../src/errors.js';

describe('DreoHttpService', () => {
  it('correctly sets base URL depending on regional configuration', () => {
    const euService = new DreoHttpService({ region: 'eu' });
    expect(euService.getBaseUrl()).toBe('https://app-api-eu.dreo-tech.com');

    const usService = new DreoHttpService({ region: 'us' });
    expect(usService.getBaseUrl()).toBe('https://app-api-us.dreo-tech.com');
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
    expect(mockFetch.mock.calls[0][0]).toContain('https://app-api-eu.dreo-tech.com/api/oauth/login');
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
    expect(mockFetch.mock.calls[0][0]).toContain('https://app-api-eu.dreo-tech.com/api/v2/user-device/device/list?');
    expect(new Headers(mockFetch.mock.calls[0][1].headers).get('authorization')).toBe('Bearer test_token_123');
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

  it('rejects with DreoApiError when the cloud returns a non-zero code', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 40101, msg: 'token expired' }),
    });

    const service = new DreoHttpService({ token: 'test_token_123', fetchFn: mockFetch as any });
    const err = await service.getDeviceList().catch((e) => e);
    expect(err).toBeInstanceOf(DreoApiError);
    expect(err.code).toBe(40101);
    expect(err.message).toContain('token expired');
  });

  it('accepts responses without a code field', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    });

    const service = new DreoHttpService({ token: 'test_token_123', fetchFn: mockFetch as any });
    await expect(service.getDeviceList()).resolves.toEqual([]);
  });

  it('rejects control commands refused by the cloud with DreoCommandError', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 11000, msg: 'device offline' }),
    });

    const service = new DreoHttpService({ token: 'test_token_123', fetchFn: mockFetch as any });
    const err = await service.sendDeviceControl('DR-HSH006-12345', { poweron: true }).catch((e) => e);
    expect(err).toBeInstanceOf(DreoCommandError);
    expect(err.code).toBe(11000);
  });

  it('reports non-JSON bodies as invalid response instead of network failure', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    });

    const service = new DreoHttpService({ token: 'test_token_123', fetchFn: mockFetch as any });
    const err = await service.getDeviceList().catch((e) => e);
    expect(err).toBeInstanceOf(DreoError);
    expect(err).not.toBeInstanceOf(DreoNetworkError);
    expect(err.message).toContain('Invalid response');
  });
});
