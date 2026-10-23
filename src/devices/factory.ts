import { DreoRawDevice } from '../types/index.js';
import { CommandTransportFn, DreoDevice } from './dreo-device.js';
import { DreoHeater } from './dreo-heater.js';
import { DreoFan } from './dreo-fan.js';

export function createDevice(rawDevice: DreoRawDevice, commandTransport: CommandTransportFn): DreoDevice {
  const modelUpper = (rawDevice.model || '').toUpperCase();
  const nameUpper = (rawDevice.deviceName || '').toUpperCase();

  // Heaters: DR-HSH series (e.g. DR-HSH006, Atom 316), WH series, or named heater
  if (
    modelUpper.startsWith('DR-HSH') ||
    modelUpper.startsWith('WH') ||
    modelUpper.includes('HEATER') ||
    modelUpper.includes('316') ||
    nameUpper.includes('HEATER') ||
    nameUpper.includes('HEIZLÜFTER') ||
    nameUpper.includes('HEIZER')
  ) {
    return new DreoHeater(rawDevice, commandTransport);
  }

  // Fans: DR-HTF (tower fans), DR-HCF (ceiling fans), DR-HPF (pedestal / air circulator), or named fan
  if (
    modelUpper.startsWith('DR-HTF') ||
    modelUpper.startsWith('DR-HCF') ||
    modelUpper.startsWith('DR-HPF') ||
    modelUpper.includes('FAN') ||
    nameUpper.includes('FAN') ||
    nameUpper.includes('LÜFTER') ||
    nameUpper.includes('VENTILATOR')
  ) {
    return new DreoFan(rawDevice, commandTransport);
  }

  // Fallback to base device
  return new DreoDevice(rawDevice, commandTransport);
}

