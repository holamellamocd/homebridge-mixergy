import type {
  PlatformAccessory,
  Service,
  CharacteristicValue,
} from 'homebridge';
import type { MixergyPlatform } from './platform';
import type { HeatSource, MixergyTank } from './mixergyApi';
import { parseState } from './mixergyApi';

// Maps HomeKit TV input identifier → Mixergy API value
const HEAT_SOURCE_BY_ID: Record<number, HeatSource> = {
  1: 'electric',
  2: 'indirect',
  3: 'heat_pump',
};

const ID_BY_HEAT_SOURCE: Record<HeatSource, number> = {
  electric: 1,
  indirect: 2,
  heat_pump: 3,
};

const INPUT_SOURCES: Array<{ id: number; name: string; subtype: string }> = [
  { id: 1, name: 'Electric',   subtype: 'input-electric'  },
  { id: 2, name: 'Indirect',   subtype: 'input-indirect'  },
  { id: 3, name: 'Heat Pump',  subtype: 'input-heat-pump' },
];

export class MixergyTankAccessory {
  private temperatureService: Service | null;
  private humidityService: Service;
  private switchService: Service;
  private televisionService: Service;

  private state = {
    temperature: 20,
    charge: 0,
    isCharging: false,
    heatSourceId: 1,
  };

  constructor(
    private readonly platform: MixergyPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly tank: MixergyTank,
  ) {
    const { Service, Characteristic } = this.platform;

    // Accessory info
    accessory.getService(Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, 'Mixergy')
      .setCharacteristic(Characteristic.Model, 'Smart Hot Water Cylinder')
      .setCharacteristic(Characteristic.SerialNumber, tank.serialNumber);

    // ── Temperature sensor (optional) ─────────────────────────────────────────
    const showTemp = this.platform.config.showTemperatureSensor !== false;
    const existingTemp = accessory.getService(Service.TemperatureSensor);
    if (!showTemp && existingTemp) {
      accessory.removeService(existingTemp);
      this.temperatureService = null;
    } else if (showTemp) {
      this.temperatureService = existingTemp
        ?? accessory.addService(Service.TemperatureSensor, 'Water Temperature');
      this.temperatureService.setCharacteristic(Characteristic.Name, 'Water Temperature');
      this.temperatureService
        .getCharacteristic(Characteristic.CurrentTemperature)
        .onGet(() => this.state.temperature);
    } else {
      this.temperatureService = null;
    }

    // ── Humidity sensor → tank charge level (shows % on tile) ────────────────
    const existingBattery = accessory.getService(Service.Battery);
    if (existingBattery) accessory.removeService(existingBattery);
    this.humidityService = accessory.getService(Service.HumiditySensor)
      ?? accessory.addService(Service.HumiditySensor, 'Tank Charge');
    this.humidityService.setCharacteristic(Characteristic.Name, 'Tank Charge');
    this.humidityService
      .getCharacteristic(Characteristic.CurrentRelativeHumidity)
      .onGet(() => this.state.charge);

    // ── Switch → start / stop heating ────────────────────────────────────────
    this.switchService = accessory.getService(Service.Switch)
      ?? accessory.addService(Service.Switch, 'Heating');
    this.switchService.setCharacteristic(Characteristic.Name, 'Heating');
    this.switchService
      .getCharacteristic(Characteristic.On)
      .onGet(() => this.state.isCharging)
      .onSet(async (value: CharacteristicValue) => {
        const on = value as boolean;
        const target = on ? (this.platform.config.onChargeTarget ?? 100) : 0;
        try {
          await this.platform.api.setCharge(this.tank.id, target);
          this.state.isCharging = on;
        } catch (err) {
          this.platform.log.error(`Failed to set charge for ${this.tank.serialNumber}:`, err);
        }
      });

    // ── Television → heat source selector ────────────────────────────────────
    this.televisionService = accessory.getService(Service.Television)
      ?? accessory.addService(Service.Television, 'Heat Source', 'heat-source-tv');

    this.televisionService
      .setCharacteristic(Characteristic.ConfiguredName, 'Heat Source')
      .setCharacteristic(
        Characteristic.SleepDiscoveryMode,
        Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE,
      );

    // The TV must appear "on" at all times — it's a selector, not a power switch.
    this.televisionService
      .getCharacteristic(Characteristic.Active)
      .onGet(() => Characteristic.Active.ACTIVE)
      .onSet(async () => {
        // Ignore power-off attempts; push ACTIVE back so Home app stays in sync.
        setTimeout(() => {
          this.televisionService
            .getCharacteristic(Characteristic.Active)
            .updateValue(Characteristic.Active.ACTIVE);
        }, 100);
      });

    this.televisionService
      .getCharacteristic(Characteristic.ActiveIdentifier)
      .onGet(() => this.state.heatSourceId)
      .onSet(async (value: CharacteristicValue) => {
        const id = value as number;
        const heatSource = HEAT_SOURCE_BY_ID[id];
        if (!heatSource) return;
        try {
          await this.platform.api.setDefaultHeatSource(this.tank.id, heatSource);
          this.state.heatSourceId = id;
          this.platform.log.debug(`[${this.tank.displayName}] heat source → ${heatSource}`);
        } catch (err) {
          this.platform.log.error(`Failed to set heat source for ${this.tank.serialNumber}:`, err);
        }
      });

    // Input source services — one per heat source option
    for (const { id, name, subtype } of INPUT_SOURCES) {
      const inputService = accessory.getServiceById(Service.InputSource, subtype)
        ?? accessory.addService(Service.InputSource, name, subtype);

      inputService
        .setCharacteristic(Characteristic.Identifier, id)
        .setCharacteristic(Characteristic.ConfiguredName, name)
        .setCharacteristic(
          Characteristic.IsConfigured,
          Characteristic.IsConfigured.CONFIGURED,
        )
        .setCharacteristic(
          Characteristic.InputSourceType,
          Characteristic.InputSourceType.OTHER,
        )
        .setCharacteristic(
          Characteristic.CurrentVisibilityState,
          Characteristic.CurrentVisibilityState.SHOWN,
        );

      this.televisionService.addLinkedService(inputService);
    }
  }

  async refresh(): Promise<void> {
    try {
      const [measurement, schedule] = await Promise.all([
        this.platform.api.getLatestMeasurement(this.tank.id),
        this.platform.api.getSchedule(this.tank.id).catch(() => null),
      ]);

      const { Characteristic } = this.platform;

      this.state.temperature = measurement.topTemperature;
      this.state.charge = Math.round(measurement.charge);

      // target_charge not always present; fall back to checking active heat sources
      if (measurement.target_charge !== undefined) {
        this.state.isCharging = measurement.target_charge > 0;
      } else {
        const s = parseState(measurement.state);
        this.state.isCharging = s.electricHeatSource || s.indirectHeatSource || s.heatPumpHeatSource;
      }

      if (schedule && typeof schedule['defaultHeatSource'] === 'string') {
        const hs = schedule['defaultHeatSource'] as HeatSource;
        this.state.heatSourceId = ID_BY_HEAT_SOURCE[hs] ?? this.state.heatSourceId;
      }

      if (this.temperatureService) {
        this.temperatureService
          .getCharacteristic(Characteristic.CurrentTemperature)
          .updateValue(this.state.temperature);
      }

      this.humidityService
        .getCharacteristic(Characteristic.CurrentRelativeHumidity)
        .updateValue(this.state.charge);

      this.switchService
        .getCharacteristic(Characteristic.On)
        .updateValue(this.state.isCharging);

      this.televisionService
        .getCharacteristic(Characteristic.ActiveIdentifier)
        .updateValue(this.state.heatSourceId);

      this.platform.log.debug(
        `[${this.tank.displayName}] temp=${measurement.topTemperature}°C ` +
        `charge=${measurement.charge}% charging=${this.state.isCharging} ` +
        `heatSource=${HEAT_SOURCE_BY_ID[this.state.heatSourceId]}`,
      );
    } catch (err) {
      this.platform.log.error(`Failed to refresh ${this.tank.serialNumber}:`, err);
    }
  }
}
