import { DREO_API_BASE_URLS, DREO_ENDPOINTS, DEFAULT_REGION, DEFAULT_TIMEOUT_MS } from '../constants.js';
import { DreoRegion, DreoAuthResponse, DreoRawDevice } from '../types/index.js';
import { DreoAuthenticationError, DreoNetworkError, DreoError } from '../errors.js';
import { md5 } from '../utils/crypto.js';

export interface HttpServiceOptions {
  region?: DreoRegion;
  timeoutMs?: number;
  token?: string;
  fetchFn?: typeof fetch;
}

export class DreoHttpService {
  private region: DreoRegion;
  private timeoutMs: number;
  private token: string | null = null;
  private fetchFn: typeof fetch;

  constructor(options: HttpServiceOptions = {}) {
    this.region = options.region ?? DEFAULT_REGION;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.token = options.token ?? null;
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  public getRegion(): DreoRegion {
    return this.region;
  }

  public setRegion(region: DreoRegion): void {
    this.region = region;
  }

  public getToken(): string | null {
    return this.token;
  }

  public setToken(token: string | null): void {
    this.token = token;
  }

  public getBaseUrl(): string {
    return DREO_API_BASE_URLS[this.region] ?? DREO_API_BASE_URLS.eu;
  }

  public async login(email: string, password: string): Promise<DreoAuthResponse> {
    const url = `${this.getBaseUrl()}${DREO_ENDPOINTS.LOGIN}`;
    const hashedPassword = md5(password);

    const payload = {
      email,
      password: hashedPassword,
      grant_type: 'email-password',
      client_id: 'dreo-app-ios',
    };

    const response = await this.request<{
      code?: number;
      msg?: string;
      message?: string;
      data?: DreoAuthResponse;
      access_token?: string;
    }>(url, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json',
      },
    }, false);

    // Some versions return wrapped { code: 0, data: { access_token } }, others return raw { access_token }
    const authData = response.data ?? (response.access_token ? (response as unknown as DreoAuthResponse) : undefined);

    if (!authData || !authData.access_token) {
      const errorMsg = response.msg ?? response.message ?? 'Unknown authentication failure';
      throw new DreoAuthenticationError(`Authentication failed: ${errorMsg}`, response.code);
    }

    this.token = authData.access_token;
    return authData;
  }

  public async getDeviceList(): Promise<DreoRawDevice[]> {
    this.ensureAuthenticated();
    const url = `${this.getBaseUrl()}${DREO_ENDPOINTS.DEVICE_LIST}`;

    const response = await this.request<{
      code?: number;
      msg?: string;
      data?: {
        list?: DreoRawDevice[];
      } | DreoRawDevice[];
    }>(url, {
      method: 'GET',
    });

    if (Array.isArray(response.data)) {
      return response.data;
    }
    if (response.data && Array.isArray(response.data.list)) {
      return response.data.list;
    }
    return [];
  }

  public async getDeviceState(deviceSn: string): Promise<Record<string, any>> {
    this.ensureAuthenticated();
    const url = `${this.getBaseUrl()}${DREO_ENDPOINTS.DEVICE_STATE}?deviceSn=${encodeURIComponent(deviceSn)}`;

    const response = await this.request<{
      code?: number;
      msg?: string;
      data?: {
        state?: Record<string, any>;
        reported?: Record<string, any>;
      } | Record<string, any>;
    }>(url, {
      method: 'GET',
    });

    if (response.data && 'state' in response.data && response.data.state) {
      return response.data.state;
    }
    if (response.data && 'reported' in response.data && response.data.reported) {
      return response.data.reported;
    }
    if (response.data && typeof response.data === 'object') {
      return response.data as Record<string, any>;
    }
    return {};
  }

  public async sendDeviceControl(deviceSn: string, params: Record<string, any>): Promise<any> {
    this.ensureAuthenticated();
    const url = `${this.getBaseUrl()}${DREO_ENDPOINTS.DEVICE_CONTROL}`;

    const payload = {
      deviceSn,
      method: 'control',
      params,
      timestamp: Date.now(),
    };

    return this.request(url, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  private ensureAuthenticated(): void {
    if (!this.token) {
      throw new DreoAuthenticationError('Client is not authenticated. Call login() or setToken() first.');
    }
  }

  private async request<T>(url: string, init: RequestInit, requireAuth = true): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'Dreo/2.5.0 (iPhone; iOS 17.5; Scale/3.00)',
      ...(init.headers as Record<string, string> | undefined),
    };

    if (requireAuth && this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
      headers['ua-authorization'] = this.token;
    }

    try {
      const res = await this.fetchFn(url, {
        ...init,
        headers,
        signal: controller.signal,
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new DreoAuthenticationError(`Authentication failed with HTTP ${res.status}: ${res.statusText}`, res.status);
        }
        throw new DreoError(`HTTP request failed with status ${res.status}: ${res.statusText}`);
      }

      return (await res.json()) as T;
    } catch (err: any) {
      if (err instanceof DreoError) {
        throw err;
      }
      if (err.name === 'AbortError') {
        throw new DreoNetworkError(`Request timed out after ${this.timeoutMs}ms`, err);
      }
      throw new DreoNetworkError(`Network request failed: ${err.message}`, err);
    } finally {
      clearTimeout(timeout);
    }
  }
}

