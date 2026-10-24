import { select, input, password, confirm, number } from '@inquirer/prompts';
import { DreoClient } from '../client.js';
import { DreoDevice } from '../devices/dreo-device.js';
import { DreoHeater } from '../devices/dreo-heater.js';
import { DreoFan } from '../devices/dreo-fan.js';
import { DreoRegion, HeaterMode, FanWindType } from '../types/index.js';
import { StoredSession, isSessionExpired, formatSessionInfo, clearSession as defaultClearSession } from './session.js';

export type SessionData = StoredSession;

export interface InteractiveMenuOptions {
  client: DreoClient;
  loadSession: () => SessionData | null;
  saveSession: (data: SessionData) => void;
  clearSession?: () => boolean;
}

export async function runInteractiveMenu(options: InteractiveMenuOptions): Promise<void> {
  const { client, loadSession, saveSession, clearSession = defaultClearSession } = options;

  let session = loadSession();
  if (!session || !session.token || isSessionExpired(session)) {
    if (session && isSessionExpired(session)) {
      console.log('\n⚠️ Deine vorherige Session ist abgelaufen. Bitte erneut anmelden:');
    } else {
      console.log('\nWillkommen bei Dreo CLI! Du bist noch nicht angemeldet.');
    }
    const loggedIn = await promptLogin(client, saveSession);
    if (!loggedIn) {
      console.log('Abbruch.');
      return;
    }
    session = loadSession();
  }

  let running = true;
  while (running) {
    console.log('\n--- Dreo CLI Hauptmenü ---');
    const action = await select({
      message: 'Was möchtest du tun?',
      choices: [
        { name: '📋 Geräte anzeigen & steuern', value: 'devices' },
        { name: '📡 Live WebSocket Monitor starten', value: 'monitor' },
        { name: 'ℹ️  Session- & Account-Status anzeigen', value: 'status' },
        { name: '🔑 Account wechseln / Neu anmelden', value: 'login' },
        { name: '🔓 Abmelden (Logout)', value: 'logout' },
        { name: '🚪 Beenden', value: 'exit' },
      ],
    });

    switch (action) {
      case 'devices':
        await handleDevicesMenu(client);
        break;
      case 'monitor':
        await handleMonitor(client);
        break;
      case 'status': {
        console.log('\n--- Dreo Session Status ---');
        console.log(formatSessionInfo(loadSession()));
        break;
      }
      case 'login':
        await promptLogin(client, saveSession);
        break;
      case 'logout': {
        const sure = await confirm({
          message: 'Möchtest du dich wirklich abmelden?',
          default: false,
        });
        if (sure) {
          clearSession();
          console.log('✅ Erfolgreich abgemeldet.');
          const reLogin = await confirm({
            message: 'Möchtest du dich jetzt mit einem anderen Account anmelden?',
            default: true,
          });
          if (reLogin) {
            await promptLogin(client, saveSession);
          } else {
            running = false;
            console.log('Tschüss!');
          }
        }
        break;
      }
      case 'exit':
        running = false;
        console.log('Tschüss!');
        break;
    }
  }
}

async function promptLogin(client: DreoClient, saveSession: (data: SessionData) => void): Promise<boolean> {
  console.log('\n--- Dreo Cloud Anmeldung ---');
  const region = (await select({
    message: 'Wähle deine Region:',
    choices: [
      { name: 'Europa (EU)', value: 'eu' },
      { name: 'Nordamerika / Global (US)', value: 'us' },
    ],
  })) as DreoRegion;

  const email = await input({
    message: 'Dreo Account E-Mail:',
    validate: (val) => (val.includes('@') ? true : 'Bitte eine gültige E-Mail-Adresse eingeben'),
  });

  const pass = await password({
    message: 'Dreo Passwort:',
    mask: '*',
    validate: (val) => (val.length > 0 ? true : 'Passwort darf nicht leer sein'),
  });

  console.log('Anmeldung läuft...');
  client.setRegion(region);

  try {
    const auth = await client.login(email, pass);
    const expiresAt = auth.expires_in
      ? new Date(Date.now() + auth.expires_in * 1000).toISOString()
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    saveSession({
      token: auth.access_token,
      region,
      email,
      createdAt: new Date().toISOString(),
      expiresAt,
    });
    console.log('✅ Erfolgreich angemeldet und Session gespeichert!');
    return true;
  } catch (err: any) {
    console.error('❌ Anmeldung fehlgeschlagen:', err.message);
    return false;
  }
}

async function handleDevicesMenu(client: DreoClient): Promise<void> {
  console.log('\nLade Geräte...');
  let devices: DreoDevice[] = [];
  try {
    devices = await client.getDevices(true);
  } catch (err: any) {
    console.error('Fehler beim Laden der Geräte:', err.message);
    return;
  }

  if (devices.length === 0) {
    console.log('Keine Geräte im Account gefunden.');
    return;
  }

  let inDeviceSelection = true;
  while (inDeviceSelection) {
    const choices = devices.map((d) => {
      const pwr = d.isPowerOn() ? '🟢 AN' : '⚪ AUS';
      let extra = '';
      if (d instanceof DreoHeater) {
        extra = ` | Ziel: ${d.getTargetTemperature() ?? '?'}°C | Ist: ${d.getCurrentTemperature() ?? '?'}°C`;
      } else if (d instanceof DreoFan) {
        extra = ` | Stufe: ${d.getSpeed()}`;
      }
      return {
        name: `${d.name} (${d.model}) - [${pwr}${extra}]`,
        value: d.sn,
      };
    });

    choices.push({ name: '⬅️ Zurück zum Hauptmenü', value: 'back' });

    const selectedSn = await select({
      message: 'Wähle ein Gerät aus:',
      choices,
    });

    if (selectedSn === 'back') {
      inDeviceSelection = false;
      break;
    }

    const device = client.getDeviceBySn(selectedSn);
    if (device) {
      await handleDeviceControl(device);
    }
  }
}

async function handleDeviceControl(device: DreoDevice): Promise<void> {
  let inControl = true;

  while (inControl) {
    console.log(`\n--- Steuerung: ${device.name} (${device.model}) ---`);
    console.log(`Status: Power ${device.isPowerOn() ? 'AN' : 'AUS'} | SN: ${device.sn}`);

    if (device instanceof DreoHeater) {
      await handleHeaterControl(device);
      inControl = false; // sub-menu handles back loop
    } else if (device instanceof DreoFan) {
      await handleFanControl(device);
      inControl = false;
    } else {
      await handleGenericControl(device);
      inControl = false;
    }
  }
}

async function handleHeaterControl(heater: DreoHeater): Promise<void> {
  let looping = true;
  while (looping) {
    const pwr = heater.isPowerOn();
    const curTemp = heater.getCurrentTemperature() ?? 'n/a';
    const targetTemp = heater.getTargetTemperature() ?? 'n/a';
    const mode = heater.getMode();
    const osc = heater.isOscillating() ? 'AN' : 'AUS';
    const childLock = heater.isChildLocked() ? 'AKTIV' : 'AUS';
    const timer = heater.getTimer();

    console.log(`\nAktueller Status: [Power: ${pwr ? '🟢 AN' : '⚪ AUS'}, Ist: ${curTemp}°C, Ziel: ${targetTemp}°C, Modus: ${mode}, Oszillation: ${osc}, Kindersicherung: ${childLock}, Timer: ${timer}h]`);

    const action = await select({
      message: `Aktion für ${heater.name}:`,
      choices: [
        { name: pwr ? '🔌 Ausschalten' : '🔌 Einschalten', value: 'toggle_power' },
        { name: '🌡️ Zieltemperatur einstellen', value: 'set_temp' },
        { name: '♨️ Betriebsmodus wählen (Heat/Eco/Fan)', value: 'set_mode' },
        { name: `🔄 Oszillation umschalten (Aktuell: ${osc})`, value: 'toggle_osc' },
        { name: `🔒 Kindersicherung umschalten (Aktuell: ${childLock})`, value: 'toggle_lock' },
        { name: `⏱️ Timer einstellen (Aktuell: ${timer}h)`, value: 'set_timer' },
        { name: '⬅️ Zurück zur Geräteauswahl', value: 'back' },
      ],
    });

    try {
      switch (action) {
        case 'toggle_power':
          await heater.setPower(!pwr);
          console.log(`✅ Power auf ${!pwr ? 'AN' : 'AUS'} gesetzt.`);
          break;
        case 'set_temp': {
          const temp = await number({
            message: 'Zieltemperatur in °C eingeben (5 - 35):',
            default: typeof targetTemp === 'number' ? targetTemp : 22,
            min: 5,
            max: 35,
          });
          if (temp !== undefined) {
            await heater.setTargetTemperature(temp);
            console.log(`✅ Zieltemperatur auf ${temp}°C gesetzt.`);
          }
          break;
        }
        case 'set_mode': {
          const chosenMode = await select({
            message: 'Modus wählen:',
            choices: [
              { name: '🌿 ECO Modus (Thermostat-Automatik)', value: 'eco' },
              { name: '🔥 Heat Stufe 1 (Niedrig)', value: 'h1' },
              { name: '🔥 Heat Stufe 2 (Mittel)', value: 'h2' },
              { name: '🔥 Heat Stufe 3 (Hoch / 1500W)', value: 'h3' },
              { name: '💨 Nur Ventilator (Keine Heizung)', value: 'fan' },
            ],
          });
          if (chosenMode === 'eco') {
            await heater.setEcoMode();
            console.log('✅ ECO-Modus aktiviert.');
          } else if (chosenMode === 'fan') {
            await heater.setFanOnlyMode();
            console.log('✅ Ventilator-Modus aktiviert.');
          } else if (chosenMode === 'h1') {
            await heater.setHeatLevel(1);
            console.log('✅ Heizstufe 1 gesetzt.');
          } else if (chosenMode === 'h2') {
            await heater.setHeatLevel(2);
            console.log('✅ Heizstufe 2 gesetzt.');
          } else if (chosenMode === 'h3') {
            await heater.setHeatLevel(3);
            console.log('✅ Heizstufe 3 gesetzt.');
          }
          break;
        }
        case 'toggle_osc':
          await heater.setOscillation(!heater.isOscillating());
          console.log(`✅ Oszillation umgeschaltet.`);
          break;
        case 'toggle_lock':
          await heater.setChildLock(!heater.isChildLocked());
          console.log(`✅ Kindersicherung umgeschaltet.`);
          break;
        case 'set_timer': {
          const hours = await number({
            message: 'Ausschalt-Timer in Stunden (0 = Aus, max. 12):',
            default: 0,
            min: 0,
            max: 12,
          });
          if (hours !== undefined) {
            await heater.setTimer(hours);
            console.log(`✅ Timer auf ${hours}h gesetzt.`);
          }
          break;
        }
        case 'back':
          looping = false;
          break;
      }
    } catch (err: any) {
      console.error('❌ Fehler beim Ausführen des Befehls:', err.message);
    }
  }
}

async function handleFanControl(fan: DreoFan): Promise<void> {
  let looping = true;
  while (looping) {
    const pwr = fan.isPowerOn();
    const speed = fan.getSpeed();
    const osc = fan.isOscillating() ? 'AN' : 'AUS';
    const wind = fan.getWindType();

    console.log(`\nAktueller Status: [Power: ${pwr ? '🟢 AN' : '⚪ AUS'}, Stufe: ${speed}, Modus: ${wind}, Oszillation: ${osc}]`);

    const action = await select({
      message: `Aktion für ${fan.name}:`,
      choices: [
        { name: pwr ? '🔌 Ausschalten' : '🔌 Einschalten', value: 'toggle_power' },
        { name: '💨 Geschwindigkeit einstellen (1 - 12)', value: 'set_speed' },
        { name: `🔄 Oszillation umschalten (Aktuell: ${osc})`, value: 'toggle_osc' },
        { name: '🍃 Wind-Modus wählen', value: 'set_wind' },
        { name: '⬅️ Zurück zur Geräteauswahl', value: 'back' },
      ],
    });

    try {
      switch (action) {
        case 'toggle_power':
          await fan.setPower(!pwr);
          console.log(`✅ Power auf ${!pwr ? 'AN' : 'AUS'} gesetzt.`);
          break;
        case 'set_speed': {
          const spd = await number({
            message: 'Geschwindigkeit (1 - 12):',
            default: speed,
            min: 1,
            max: 12,
          });
          if (spd !== undefined) {
            await fan.setSpeed(spd);
            console.log(`✅ Geschwindigkeit auf ${spd} gesetzt.`);
          }
          break;
        }
        case 'toggle_osc':
          await fan.setOscillation(!fan.isOscillating());
          console.log(`✅ Oszillation umgeschaltet.`);
          break;
        case 'set_wind': {
          const chosenWind = (await select({
            message: 'Wind-Modus:',
            choices: [
              { name: 'Normal', value: FanWindType.Normal },
              { name: 'Natural (Natürliche Brise)', value: FanWindType.Natural },
              { name: 'Sleep (Schlafmodus)', value: FanWindType.Sleep },
              { name: 'Auto', value: FanWindType.Auto },
            ],
          })) as FanWindType;
          await fan.setWindType(chosenWind);
          console.log(`✅ Wind-Modus auf ${chosenWind} gesetzt.`);
          break;
        }
        case 'back':
          looping = false;
          break;
      }
    } catch (err: any) {
      console.error('❌ Fehler beim Ausführen des Befehls:', err.message);
    }
  }
}

async function handleGenericControl(device: DreoDevice): Promise<void> {
  let looping = true;
  while (looping) {
    const pwr = device.isPowerOn();
    console.log(`\nAktueller Status: [Power: ${pwr ? '🟢 AN' : '⚪ AUS'}]`);

    const action = await select({
      message: `Aktion für ${device.name}:`,
      choices: [
        { name: pwr ? '🔌 Ausschalten' : '🔌 Einschalten', value: 'toggle_power' },
        { name: '🛠️ Eigenen Parameter senden', value: 'custom_param' },
        { name: '⬅️ Zurück zur Geräteauswahl', value: 'back' },
      ],
    });

    try {
      if (action === 'toggle_power') {
        await device.setPower(!pwr);
        console.log(`✅ Power auf ${!pwr ? 'AN' : 'AUS'} gesetzt.`);
      } else if (action === 'custom_param') {
        const key = await input({ message: 'Parameter-Name (z.B. brightness):' });
        const valStr = await input({ message: 'Parameter-Wert (JSON oder String):' });
        let val: any = valStr;
        try {
          val = JSON.parse(valStr);
        } catch {
          // keep as string
        }
        await device.sendCommand(key, val);
        console.log(`✅ Parameter ${key} gesendet.`);
      } else {
        looping = false;
      }
    } catch (err: any) {
      console.error('❌ Fehler beim Senden:', err.message);
    }
  }
}

async function handleMonitor(client: DreoClient): Promise<void> {
  console.log('\n📡 Verbinde mit Dreo WebSocket Live-Stream...');
  try {
    await client.startMonitoring();
  } catch (err: any) {
    console.error('WebSocket-Verbindung fehlgeschlagen:', err.message);
    return;
  }

  const onUpdate = (dev: DreoDevice, diff: Record<string, any>) => {
    const time = new Date().toLocaleTimeString();
    console.log(`\n[${time}] 🔔 Update von ${dev.name} (${dev.sn}):`, diff);
  };

  const onError = (err: Error) => {
    console.warn(`\n⚠️ WebSocket-Hinweis: ${err.message}`);
  };

  client.on('deviceUpdate', onUpdate);
  client.on('error', onError);

  console.log('✅ Live-Monitor aktiv!');
  await input({
    message: 'Drücke [ENTER], um den Monitor zu stoppen und zum Menü zurückzukehren',
  });

  client.off('deviceUpdate', onUpdate);
  client.off('error', onError);
  client.stopMonitoring();
  console.log('Monitor beendet.');
}

