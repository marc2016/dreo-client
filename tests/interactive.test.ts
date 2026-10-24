import { describe, it, expect, vi, beforeEach } from 'vitest';

const prompts = vi.hoisted(() => ({
  select: vi.fn(),
  input: vi.fn(),
  password: vi.fn(),
  confirm: vi.fn(),
  number: vi.fn(),
}));
vi.mock('@inquirer/prompts', () => prompts);

import { runInteractiveMenu } from '../src/cli/interactive.js';
import { DreoHeater } from '../src/devices/dreo-heater.js';

class ExitPromptError extends Error {
  name = 'ExitPromptError';
}

const activeSession = () => ({
  token: 'test_token',
  region: 'eu' as const,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
});

describe('runInteractiveMenu', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('treats Ctrl+C in the main menu as a normal exit and closes the client', async () => {
    const client = { close: vi.fn() } as any;
    prompts.select.mockRejectedValueOnce(new ExitPromptError('User force closed the prompt'));

    await expect(
      runInteractiveMenu({ client, loadSession: activeSession, saveSession: vi.fn() })
    ).resolves.toBeUndefined();
    expect(client.close).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith('\nTschüss!');
  });

  it('exits on Ctrl+C inside a device prompt instead of reporting a command error', async () => {
    const transport = vi.fn().mockResolvedValue({});
    const heater = new DreoHeater({ deviceSn: 'HSH-1', model: 'DR-HSH006', deviceName: 'Heater' }, transport);
    const client = {
      close: vi.fn(),
      getDevices: vi.fn().mockResolvedValue([heater]),
      getDeviceBySn: vi.fn().mockReturnValue(heater),
    } as any;

    prompts.select
      .mockResolvedValueOnce('devices') // main menu
      .mockResolvedValueOnce('HSH-1') // device selection
      .mockResolvedValueOnce('set_temp'); // heater action
    prompts.number.mockRejectedValueOnce(new ExitPromptError('User force closed the prompt'));

    await runInteractiveMenu({ client, loadSession: activeSession, saveSession: vi.fn() });

    expect(console.error).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
    expect(client.close).toHaveBeenCalledTimes(1);
  });

  it('closes the client when the user chooses exit', async () => {
    const client = { close: vi.fn() } as any;
    prompts.select.mockResolvedValueOnce('exit');

    await runInteractiveMenu({ client, loadSession: activeSession, saveSession: vi.fn() });
    expect(client.close).toHaveBeenCalledTimes(1);
  });
});
