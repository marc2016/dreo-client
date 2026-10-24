import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DreoRegion } from '../types/index.js';

export interface StoredSession {
  token: string;
  region: DreoRegion;
  email?: string;
  createdAt?: string;
  expiresAt?: string;
}

export const CONFIG_DIR = join(homedir(), '.dreo');
export const SESSION_FILE = join(CONFIG_DIR, 'session.json');

export function loadSession(customPath?: string): StoredSession | null {
  const filePath = customPath ?? SESSION_FILE;
  if (!existsSync(filePath)) return null;
  try {
    const raw = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.token) {
      return null;
    }
    return parsed as StoredSession;
  } catch {
    return null;
  }
}

export function saveSession(data: StoredSession, customPath?: string): void {
  const filePath = customPath ?? SESSION_FILE;
  const dirPath = customPath ? join(filePath, '..') : CONFIG_DIR;

  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  }

  const now = new Date();
  const sessionToSave: StoredSession = {
    ...data,
    createdAt: data.createdAt ?? now.toISOString(),
    expiresAt: data.expiresAt ?? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };

  writeFileSync(filePath, JSON.stringify(sessionToSave, null, 2), { mode: 0o600 });
}

export function clearSession(customPath?: string): boolean {
  const filePath = customPath ?? SESSION_FILE;
  if (existsSync(filePath)) {
    try {
      unlinkSync(filePath);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function isSessionExpired(session: StoredSession | null): boolean {
  if (!session || !session.token) return true;
  if (!session.expiresAt) return false;
  const expiryTime = new Date(session.expiresAt).getTime();
  if (isNaN(expiryTime)) return false;
  return Date.now() >= expiryTime;
}

export function formatSessionInfo(session: StoredSession | null): string {
  if (!session || !session.token) {
    return 'Nicht angemeldet (Keine aktive Session). Führe "dreo login" aus.';
  }

  const expired = isSessionExpired(session);
  const emailStr = session.email ? session.email : 'Unbekannt';
  const regionStr = session.region ? session.region.toUpperCase() : 'EU';
  const maskedToken = session.token.length > 10
    ? `${session.token.slice(0, 6)}...${session.token.slice(-4)}`
    : '***';

  let expiryStr = 'Unbegrenzt / Legacy';
  const statusBadge = expired ? '❌ ABGELAUFEN' : '✅ AKTIV';

  if (session.expiresAt) {
    const expDate = new Date(session.expiresAt);
    if (!isNaN(expDate.getTime())) {
      const remainingMs = expDate.getTime() - Date.now();
      if (remainingMs > 0) {
        const days = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
        const hours = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        expiryStr = `${expDate.toLocaleString()} (noch ${days}d ${hours}h gültig)`;
      } else {
        expiryStr = `${expDate.toLocaleString()} (abgelaufen)`;
      }
    }
  }

  return [
    `Account:  ${emailStr}`,
    `Region:   ${regionStr}`,
    `Status:   ${statusBadge}`,
    `Gültig:   ${expiryStr}`,
    `Token:    ${maskedToken}`,
  ].join('\n');
}

