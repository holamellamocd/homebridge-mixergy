import type {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
} from 'homebridge';
import { MixergyApi } from './mixergyApi';
import { MixergyTankAccessory } from './platformAccessory';

const PLUGIN_NAME = 'homebridge-mixergy';
const PLATFORM_NAME = 'Mixergy';

export interface MixergyConfig extends PlatformConfig {
  username: string;
  password: string;
  pollIntervalSeconds?: number;
  onChargeTarget?: number;
  lowChargeThreshold?: number;
}

export class MixergyPlatform implements DynamicPlatformPlugin {
  public readonly Service;
  public readonly Characteristic;
  public readonly api: MixergyApi;

  private readonly accessories = new Map<string, PlatformAccessory>();
  private readonly tankAccessories = new Map<string, MixergyTankAccessory>();

  constructor(
    public readonly log: Logger,
    public readonly config: MixergyConfig,
    public readonly homebridgeApi: API,
  ) {
    this.Service = homebridgeApi.hap.Service;
    this.Characteristic = homebridgeApi.hap.Characteristic;

    this.api = new MixergyApi(config.username, config.password, log);

    homebridgeApi.on('didFinishLaunching', () => this.discoverDevices());
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.log.debug('Restoring cached accessory:', accessory.displayName);
    this.accessories.set(accessory.UUID, accessory);
  }

  private async discoverDevices(): Promise<void> {
    try {
      await this.api.authenticate();
    } catch (err) {
      this.log.error('Failed to authenticate with Mixergy — check username/password:', err);
      return;
    }

    let tanks;
    try {
      tanks = await this.api.getTanks();
    } catch (err) {
      this.log.error('Failed to retrieve tank list:', err);
      return;
    }

    if (tanks.length === 0) {
      this.log.warn('No Mixergy tanks found for this account');
      return;
    }

    const seenUUIDs = new Set<string>();

    for (const tank of tanks) {
      const uuid = this.homebridgeApi.hap.uuid.generate(tank.id);
      seenUUIDs.add(uuid);

      const displayName = tank.displayName;
      const existing = this.accessories.get(uuid);

      if (existing) {
        this.log.info('Restoring tank:', displayName);
        const acc = new MixergyTankAccessory(this, existing, tank);
        this.tankAccessories.set(uuid, acc);
      } else {
        this.log.info('Discovered new tank:', displayName);
        const accessory = new this.homebridgeApi.platformAccessory(displayName, uuid);
        accessory.context.tank = tank;
        const acc = new MixergyTankAccessory(this, accessory, tank);
        this.tankAccessories.set(uuid, acc);
        this.homebridgeApi.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.accessories.set(uuid, accessory);
      }
    }

    // Remove stale accessories no longer in the account
    for (const [uuid, accessory] of this.accessories) {
      if (!seenUUIDs.has(uuid)) {
        this.log.info('Removing stale accessory:', accessory.displayName);
        this.homebridgeApi.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.accessories.delete(uuid);
      }
    }

    // Initial data fetch then start polling
    await this.refreshAll();
    const interval = (this.config.pollIntervalSeconds ?? 30) * 1000;
    setInterval(() => this.refreshAll(), interval);
  }

  private async refreshAll(): Promise<void> {
    await Promise.all([...this.tankAccessories.values()].map(a => a.refresh()));
  }
}
