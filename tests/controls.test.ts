import { describe, it, expect, vi } from 'vitest';
import { parseControlFlags, applyControlPlan, CliUsageError } from '../src/cli/controls.js';
import { DreoHeater } from '../src/devices/dreo-heater.js';
import { DreoFan } from '../src/devices/dreo-fan.js';
import { DreoDevice } from '../src/devices/dreo-device.js';
import { HeaterMode } from '../src/types/index.js';

const heater = (transport = vi.fn().mockResolvedValue({})) =>
  new DreoHeater({ deviceSn: 'HSH-1', model: 'DR-HSH006', deviceName: 'Heater' }, transport);
const fan = (transport = vi.fn().mockResolvedValue({})) =>
  new DreoFan({ deviceSn: 'HTF-1', model: 'DR-HTF001', deviceName: 'Fan' }, transport);

describe('parseControlFlags', () => {
  it('parses a full heater flag set', () => {
    expect(
      parseControlFlags({ power: 'on', mode: 'heat', level: '2', temp: '21.5', oscillate: 'off', 'child-lock': 'true', timer: '3' })
    ).toEqual({ power: true, mode: HeaterMode.Heat, level: 2, temp: 21.5, oscillate: false, childLock: true, timer: 3 });
  });

  it.each([
    [{ oscillate: true }, /--oscillate expects "on" or "off"/],
    [{ power: 'maybe' }, /--power expects "on" or "off"/],
    [{ mode: 'turbo' }, /--mode expects one of/],
    [{ temp: 'abc' }, /--temp expects a number between 5 and 35/],
    [{ temp: '50' }, /--temp expects a number between 5 and 35/],
    [{ level: '4' }, /--level expects an integer between 1 and 3/],
    [{ speed: '2.5' }, /--speed expects an integer/],
    [{ timer: true }, /--timer expects an integer between 0 and 12/],
    [{ mode: 'eco', level: '2' }, /--level can only be combined with --mode heat/],
  ])('rejects invalid flags %j', (flags, message) => {
    expect(() => parseControlFlags(flags)).toThrow(CliUsageError);
    expect(() => parseControlFlags(flags)).toThrow(message);
  });

  it('ignores flags that are not control flags', () => {
    expect(parseControlFlags({ region: 'eu' })).toEqual({});
  });
});

describe('applyControlPlan', () => {
  it('maps --mode heat --level 2 onto the heater heat-level control', async () => {
    const transport = vi.fn().mockResolvedValue({});
    const device = heater(transport);
    const setMode = vi.spyOn(device, 'setMode');

    await applyControlPlan(device, parseControlFlags({ mode: 'heat', level: '2' }));

    expect(setMode).toHaveBeenCalledWith(HeaterMode.Heat, 2);
    expect(transport).toHaveBeenCalledWith({ mode: 'hotair', htalevel: 2, mode_level: 2, heat_level: 2 });
  });

  it('applies heater controls in a fixed order', async () => {
    const transport = vi.fn().mockResolvedValue({});
    await applyControlPlan(
      heater(transport),
      parseControlFlags({ timer: '2', 'child-lock': 'on', oscillate: 'on', temp: '21', mode: 'eco', power: 'on' })
    );

    const sentKeys = transport.mock.calls.map(([params]) => Object.keys(params)[0]);
    expect(sentKeys).toEqual(['poweron', 'mode', 'ecolevel', 'horoshake', 'childlockon', 'timer']);
  });

  it('applies fan speed and oscillation', async () => {
    const transport = vi.fn().mockResolvedValue({});
    await applyControlPlan(fan(transport), parseControlFlags({ speed: '6', oscillate: 'on' }));

    expect(transport).toHaveBeenNthCalledWith(1, { windlevel: 6, wind_level: 6 });
    expect(transport).toHaveBeenNthCalledWith(2, { horoshake: true, oscillation: true });
  });

  it('rejects --speed on a heater without sending anything', async () => {
    const transport = vi.fn().mockResolvedValue({});
    await expect(applyControlPlan(heater(transport), parseControlFlags({ power: 'on', speed: '3' }))).rejects.toThrow(
      /--speed is not supported/
    );
    expect(transport).not.toHaveBeenCalled();
  });

  it('rejects --timer on a fan without sending anything', async () => {
    const transport = vi.fn().mockResolvedValue({});
    await expect(applyControlPlan(fan(transport), parseControlFlags({ timer: '2' }))).rejects.toThrow(CliUsageError);
    expect(transport).not.toHaveBeenCalled();
  });

  it('only supports --power for generic devices', async () => {
    const transport = vi.fn().mockResolvedValue({});
    const device = new DreoDevice({ deviceSn: 'GEN-1', model: 'X', deviceName: 'Gadget' }, transport);

    await applyControlPlan(device, parseControlFlags({ power: 'off' }));
    expect(transport).toHaveBeenCalledWith({ poweron: false });

    await expect(applyControlPlan(device, parseControlFlags({ oscillate: 'on' }))).rejects.toThrow(/--oscillate is not supported/);
  });
});
