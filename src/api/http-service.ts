import { DREO_API_BASE_URLS, DREO_ENDPOINTS, DREO_CLIENT_CONFIG, DEFAULT_REGION, DEFAULT_TIMEOUT_MS } from '../constants.js';
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
    const url = `${this.getBaseUrl()}${DREO_ENDPOINTS.LOGIN}?timestamp=${Date.now()}`;
    const hashedPassword = md5(password);

    const tryAuth = async (passToSend: string) => {
      const payload = {
        acceptLanguage: 'en',
        client_id: DREO_CLIENT_CONFIG.CLIENT_ID,
        client_secret: DREO_CLIENT_CONFIG.CLIENT_SECRET,
        email,
        encrypt: 'ciphertext',
        grant_type: 'email-password',
        himei: DREO_CLIENT_CONFIG.HIMEI,
        password: passToSend,
        scope: 'all',
      };

      return this.request<{
        code?: number;
        msg?: string;
        message?: string;
        data?: DreoAuthResponse;
        access_token?: string;
      }>(url, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
        },
      }, false);
    };

    let response = await tryAuth(hashedPassword);
    let authData = response.data ?? (response.access_token ? (response as unknown as DreoAuthResponse) : undefined);

    if ((!authData || !authData.access_token) && (response.code === 100021 || response.code === 100022)) {
      // Fallback with plaintext password in case endpoint configuration accepts raw format
      try {
        const fallbackResponse = await tryAuth(password);
        const fallbackData = fallbackResponse.data ?? (fallbackResponse.access_token ? (fallbackResponse as unknown as DreoAuthResponse) : undefined);
        if (fallbackData && fallbackData.access_token) {
          response = fallbackResponse;
          authData = fallbackData;
        }
      } catch {
        // ignore and let main error handler report the primary failure
      }
    }

    if (!authData || !authData.access_token) {
      const errorMsg = response.msg ?? response.message ?? 'Unknown authentication failure';
      throw new DreoAuthenticationError(`Authentication failed: ${errorMsg}`, response.code);
    }

    this.token = authData.access_token;
    return authData;
  }

  public async getDeviceList(): Promise<DreoRawDevice[]> {
    this.ensureAuthenticated();
    const query = new URLSearchParams({
      acceptLanguage: 'en',
      method: 'devices',
      pageNo: '1',
      pageSize: '100',
      timestamp: Date.now().toString(),
    });
    const url = `${this.getBaseUrl()}/api/v2/user-device/device/list?${query.toString()}`;

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
    const query = new URLSearchParams({
      deviceSn,
      timestamp: Date.now().toString(),
    });
    const url = `${this.getBaseUrl()}${DREO_ENDPOINTS.DEVICE_STATE}?${query.toString()}`;

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
    const url = `${this.getBaseUrl()}${DREO_ENDPOINTS.DEVICE_CONTROL}?timestamp=${Date.now()}`;

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
      ua: DREO_CLIENT_CONFIG.UA,
      lang: 'en',
      'User-Agent': DREO_CLIENT_CONFIG.USER_AGENT,
      ...(init.headers as Record<string, string> | undefined),
    };

    if (requireAuth && this.token) {
      headers['authorization'] = `Bearer ${this.token}`;
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

