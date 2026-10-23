import { describe, it, expect, vi } from 'vitest';
import { DreoDevice } from '../src/devices/dreo-device.js';
import { DreoHeater } from '../src/devices/dreo-heater.js';
import { DreoFan } from '../src/devices/dreo-fan.js';
import { createDevice } from '../src/devices/factory.js';
import { HeaterMode, FanWindType } from '../src/types/index.js';

describe('Device Hierarchy & Controls', () => {
  it('DreoDevice handles state diffs and emits change events', async () => {
    const transport = vi.fn().mockResolvedValue({ success: true });
    const device = new DreoDevice(
      {
        deviceSn: 'GEN-001',
        model: 'UNKNOWN-01',
        deviceName: 'Generic Gadget',
        reported: { poweron: false, brightness: 50 },
      },
      transport
    );

    const changeSpy = vi.fn();
    device.on('change', changeSpy);

    const diff = device.updateState({ poweron: true, brightness: 50, humidity: 45 });
    expect(diff).toEqual({ poweron: true, humidity: 45 });
    expect(changeSpy).toHaveBeenCalledWith({ poweron: true, humidity: 45 });
    expect(device.isPowerOn()).toBe(true);

    await device.setPower(false);
    expect(transport).toHaveBeenCalledWith({ poweron: false });
    expect(device.isPowerOn()).toBe(false);
  });

  it('DreoHeater provides typed controls for temperature, modes, and features', async () => {
    const transport = vi.fn().mockResolvedValue({ success: true });
    const heater = new DreoHeater(
      {
        deviceSn: 'DR-HSH006-1234',
        model: 'DR-HSH006',
        deviceName: 'Atom 316 Space Heater',
        reported: { poweron: true, cur_temp: 19, target_temp: 20, mode: 'eco' },
      },
      transport
    );

    expect(heater.getCurrentTemperature()).toBe(19);
    expect(heater.getTargetTemperature()).toBe(20);
    expect(heater.getMode()).toBe(HeaterMode.Eco);

    await heater.setTargetTemperature(23);
    expect(transport).toHaveBeenCalledWith({
      target_temp: 23,
      templevel: 23,
      temp_unit: 'celsius',
    });
    expect(heater.getTargetTemperature()).toBe(23);

    await heater.setHeatLevel(2);
    expect(transport).toHaveBeenCalledWith({
      mode: 'heat',
      mode_level: 2,
      heat_level: 2,
    });
    expect(heater.getHeatLevel()).toBe(2);

    await heater.setOscillation(true);
    expect(transport).toHaveBeenCalledWith({
      horoshake: true,
      oscillation: true,
    });
    expect(heater.isOscillating()).toBe(true);

    await heater.setChildLock(true);
    expect(transport).toHaveBeenCalledWith({
      child_lock: true,
      childlock: true,
    });
    expect(heater.isChildLocked()).toBe(true);

    await heater.setTimer(4);
    expect(transport).toHaveBeenCalledWith({
      timer: 4,
      off_timer: 4,
    });
    expect(heater.getTimer()).toBe(4);
  });

  it('DreoFan provides speed and oscillation controls', async () => {
    const transport = vi.fn().mockResolvedValue({ success: true });
    const fan = new DreoFan(
      {
        deviceSn: 'DR-HTF001-999',
        model: 'DR-HTF001',
        deviceName: 'Living Room Tower Fan',
        reported: { poweron: true, windlevel: 2, horoshake: false },
      },
      transport
    );

    expect(fan.getSpeed()).toBe(2);
    expect(fan.isOscillating()).toBe(false);

    await fan.setSpeed(5);
    expect(transport).toHaveBeenCalledWith({
      windlevel: 5,
      wind_level: 5,
    });
    expect(fan.getSpeed()).toBe(5);

    await fan.setWindType(FanWindType.Natural);
    expect(transport).toHaveBeenCalledWith({
      windtype: FanWindType.Natural,
      wind_type: FanWindType.Natural,
    });
    expect(fan.getWindType()).toBe(FanWindType.Natural);
  });

  it('createDevice factory maps models to correct subclasses', () => {
    const transport = vi.fn();

    const heaterDevice = createDevice(
      {
        deviceSn: 'HSH-006',
        model: 'DR-HSH006',
        deviceName: 'Dreo Atom 316',
      },
      transport
    );
    expect(heaterDevice).toBeInstanceOf(DreoHeater);

    const fanDevice = createDevice(
      {
        deviceSn: 'HTF-001',
        model: 'DR-HTF001',
        deviceName: 'Tower Fan',
      },
      transport
    );
    expect(fanDevice).toBeInstanceOf(DreoFan);

    const genericDevice = createDevice(
      {
        deviceSn: 'XYZ-999',
        model: 'DR-CUSTOM-XYZ',
        deviceName: 'Unknown Device',
      },
      transport
    );
    expect(genericDevice).toBeInstanceOf(DreoDevice);
    expect(genericDevice).not.toBeInstanceOf(DreoHeater);
    expect(genericDevice).not.toBeInstanceOf(DreoFan);
  });
});

