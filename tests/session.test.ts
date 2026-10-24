import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadSession,
  saveSession,
  clearSession,
  isSessionExpired,
  formatSessionInfo,
  StoredSession,
} from '../src/cli/session.js';

describe('CLI Session Management', () => {
  const testDir = join(tmpdir(), `dreo-session-test-${Date.now()}`);
  const testFile = join(testDir, 'session.json');

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('loadSession', () => {
    it('returns null when session file does not exist', () => {
      expect(loadSession(testFile)).toBeNull();
    });

    it('returns null for malformed json or missing token', () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(testFile, 'not-valid-json');
      expect(loadSession(testFile)).toBeNull();

      writeFileSync(testFile, JSON.stringify({ email: 'test@example.com' }));
      expect(loadSession(testFile)).toBeNull();
    });

    it('loads valid session file successfully', () => {
      mkdirSync(testDir, { recursive: true });
      const valid: StoredSession = {
        token: 'token_12345',
        region: 'eu',
        email: 'user@example.com',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };
      writeFileSync(testFile, JSON.stringify(valid));

      const loaded = loadSession(testFile);
      expect(loaded).toBeDefined();
      expect(loaded?.token).toBe('token_12345');
      expect(loaded?.email).toBe('user@example.com');
      expect(loaded?.region).toBe('eu');
    });
  });

  describe('saveSession & clearSession', () => {
    it('creates directory and writes session file with timestamps', () => {
      const sessionData: StoredSession = {
        token: 'auth_token_abc',
        region: 'us',
        email: 'john@example.com',
      };

      saveSession(sessionData, testFile);
      expect(existsSync(testFile)).toBe(true);

      const loaded = loadSession(testFile);
      expect(loaded?.token).toBe('auth_token_abc');
      expect(loaded?.createdAt).toBeDefined();
      expect(loaded?.expiresAt).toBeDefined();
    });

    it('clears session file and returns boolean status', () => {
      saveSession({ token: 'abc', region: 'eu' }, testFile);
      expect(existsSync(testFile)).toBe(true);

      expect(clearSession(testFile)).toBe(true);
      expect(existsSync(testFile)).toBe(false);

      expect(clearSession(testFile)).toBe(false);
    });
  });

  describe('isSessionExpired', () => {
    it('returns true if session is null or token is missing', () => {
      expect(isSessionExpired(null)).toBe(true);
      expect(isSessionExpired({ token: '', region: 'eu' })).toBe(true);
    });

    it('returns false for legacy sessions without expiresAt', () => {
      const legacy: StoredSession = {
        token: 'some_token',
        region: 'eu',
      };
      expect(isSessionExpired(legacy)).toBe(false);
    });

    it('returns false for active session in the future', () => {
      const active: StoredSession = {
        token: 'some_token',
        region: 'eu',
        expiresAt: new Date(Date.now() + 1000 * 3600).toISOString(),
      };
      expect(isSessionExpired(active)).toBe(false);
    });

    it('returns true for expired session in the past', () => {
      const expired: StoredSession = {
        token: 'some_token',
        region: 'eu',
        expiresAt: new Date(Date.now() - 1000 * 3600).toISOString(),
      };
      expect(isSessionExpired(expired)).toBe(true);
    });
  });

  describe('formatSessionInfo', () => {
    it('returns unauthenticated message when session is null', () => {
      expect(formatSessionInfo(null)).toContain('Nicht angemeldet');
    });

    it('formats active session with masked token and remaining time', () => {
      const active: StoredSession = {
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdefg',
        region: 'eu',
        email: 'tester@example.com',
        expiresAt: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
      };

      const formatted = formatSessionInfo(active);
      expect(formatted).toContain('tester@example.com');
      expect(formatted).toContain('EU');
      expect(formatted).toContain('AKTIV');
      expect(formatted).toContain('noch 5d');
      expect(formatted).toContain('eyJhbG...defg');
    });

    it('formats expired session badge', () => {
      const expired: StoredSession = {
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdefg',
        region: 'us',
        email: 'tester@example.com',
        expiresAt: new Date(Date.now() - 3600 * 1000).toISOString(),
      };

      const formatted = formatSessionInfo(expired);
      expect(formatted).toContain('ABGELAUFEN');
    });
  });
});

